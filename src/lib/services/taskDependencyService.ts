/**
 * Task Dependency Service
 * Handles task dependencies with cycle detection (blocks/blocked_by)
 */

import { query, queryOne, buildInsert, execute } from '@/lib/db';

export interface TaskDependency {
  id: string;
  task_id: string;
  depends_on_task_id: string;
  dependency_type: 'blocks' | 'blocked_by' | 'related';
  created_at: string;
}

export interface DependencyGraph {
  blockingTasks: string[];
  blockedByTasks: string[];
  relatedTasks: string[];
}

/**
 * Add a dependency between two tasks
 * @param taskId - Task ID
 * @param dependsOnTaskId - Task this one depends on
 * @param dependencyType - Type of dependency
 * @returns Created dependency
 */
export async function addDependency(
  taskId: string,
  dependsOnTaskId: string,
  dependencyType: 'blocks' | 'blocked_by' | 'related' = 'blocks'
): Promise<TaskDependency> {
  // Validate: cannot depend on self
  if (taskId === dependsOnTaskId) {
    throw new Error('Task cannot depend on itself');
  }

  // Validate: target task must exist and not be cancelled
  const targetTask = await queryOne(
    'SELECT status FROM tasks WHERE id = $1',
    [dependsOnTaskId]
  );
  if (!targetTask) {
    throw new Error('Target task not found');
  }
  if (targetTask.status === 'cancelled') {
    throw new Error('Cannot depend on cancelled tasks');
  }

  // Check for existing dependency
  const existing = await queryOne(
    'SELECT id FROM task_dependencies WHERE task_id = $1 AND depends_on_task_id = $2',
    [taskId, dependsOnTaskId]
  );
  if (existing) {
    throw new Error('Dependency already exists');
  }

  // Validate: no circular dependencies
  const hasCycle = await validateNoCycles(taskId, [dependsOnTaskId]);
  if (hasCycle) {
    throw new Error('Adding this dependency would create a circular reference');
  }

  const depId = `dep_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  const { text, params } = buildInsert('task_dependencies', {
    id: depId,
    task_id: taskId,
    depends_on_task_id: dependsOnTaskId,
    dependency_type: dependencyType,
  });

  const dependency = await queryOne<TaskDependency>(text, params);
  if (!dependency) {
    throw new Error('Failed to create dependency');
  }

  return dependency;
}

/**
 * Validate that adding dependencies won't create cycles
 * @param taskId - Task ID
 * @param proposedDependencies - Array of task IDs to depend on
 * @returns Boolean indicating if cycle would exist
 */
export async function validateNoCycles(
  taskId: string,
  proposedDependencies: string[]
): Promise<boolean> {
  if (proposedDependencies.length === 0) {
    return false;
  }

  // Build a map of all dependencies
  const allDeps = await query<{ task_id: string; depends_on_task_id: string }>(
    'SELECT task_id, depends_on_task_id FROM task_dependencies WHERE task_id != \'\'',
    []
  );

  const depMap = new Map<string, Set<string>>();
  if (allDeps) {
    allDeps.forEach(dep => {
      if (!depMap.has(dep.task_id)) {
        depMap.set(dep.task_id, new Set());
      }
      depMap.get(dep.task_id)!.add(dep.depends_on_task_id);
    });
  }

  // Add proposed dependencies
  if (!depMap.has(taskId)) {
    depMap.set(taskId, new Set());
  }
  proposedDependencies.forEach(depId => {
    depMap.get(taskId)!.add(depId);
  });

  // DFS cycle detection
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  const hasCycleDFS = (node: string): boolean => {
    visited.add(node);
    recursionStack.add(node);

    const neighbors = depMap.get(node) || new Set();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (hasCycleDFS(neighbor)) {
          return true;
        }
      } else if (recursionStack.has(neighbor)) {
        return true;
      }
    }

    recursionStack.delete(node);
    return false;
  };

  // Check from the perspective of proposed dependencies
  // If any proposed dependency can reach back to taskId, there's a cycle
  for (const depId of proposedDependencies) {
    visited.clear();
    recursionStack.clear();
    if (canReach(depId, taskId, depMap)) {
      return true;
    }
  }

  return false;
}

/**
 * Helper: Check if one task can reach another via dependencies
 */
function canReach(
  from: string,
  to: string,
  depMap: Map<string, Set<string>>,
  visited = new Set<string>()
): boolean {
  if (from === to) {
    return true;
  }
  if (visited.has(from)) {
    return false;
  }

  visited.add(from);
  const neighbors = depMap.get(from) || new Set();

  for (const neighbor of neighbors) {
    if (canReach(neighbor, to, depMap, visited)) {
      return true;
    }
  }

  return false;
}

/**
 * Get all dependencies for a task
 * @param taskId - Task ID
 * @returns Dependency graph (blocking, blocked by, related)
 */
export async function getDependencies(taskId: string): Promise<DependencyGraph> {
  const sql = `
    SELECT task_id, depends_on_task_id, dependency_type FROM task_dependencies
    WHERE task_id = $1 OR depends_on_task_id = $1
  `;

  const deps = await query<TaskDependency>(sql, [taskId]);

  const result: DependencyGraph = {
    blockingTasks: [],
    blockedByTasks: [],
    relatedTasks: [],
  };

  if (!deps) {
    return result;
  }

  deps.forEach(dep => {
    if (dep.task_id === taskId) {
      // taskId depends on others
      if (dep.dependency_type === 'blocks') {
        result.blockingTasks.push(dep.depends_on_task_id);
      } else if (dep.dependency_type === 'blocked_by') {
        result.blockedByTasks.push(dep.depends_on_task_id);
      } else {
        result.relatedTasks.push(dep.depends_on_task_id);
      }
    } else {
      // Others depend on taskId
      if (dep.dependency_type === 'blocks') {
        result.blockedByTasks.push(dep.task_id);
      } else if (dep.dependency_type === 'blocked_by') {
        result.blockingTasks.push(dep.task_id);
      } else {
        result.relatedTasks.push(dep.task_id);
      }
    }
  });

  return result;
}

/**
 * Remove a dependency
 * @param taskId - Task ID
 * @param dependsOnTaskId - Task dependency to remove
 * @returns Number of rows deleted
 */
export async function removeDependency(
  taskId: string,
  dependsOnTaskId: string
): Promise<number> {
  return await execute(
    'DELETE FROM task_dependencies WHERE task_id = $1 AND depends_on_task_id = $2',
    [taskId, dependsOnTaskId]
  );
}

/**
 * Check if a task can be set to cancelled (no blocking dependencies)
 * @param taskId - Task ID
 * @returns Boolean indicating if task can be cancelled
 */
export async function canCancelTask(taskId: string): Promise<boolean> {
  // Check if any other tasks depend on this one
  const blocking = await queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM task_dependencies
     WHERE depends_on_task_id = $1 AND dependency_type = 'blocks'`,
    [taskId]
  );

  return (blocking?.count ?? 0) === 0;
}

/**
 * Get all tasks that depend on a given task
 * @param taskId - Task ID
 * @returns Array of dependent task IDs
 */
export async function getDependentTasks(taskId: string): Promise<string[]> {
  const deps = await query<{ task_id: string }>(
    'SELECT task_id FROM task_dependencies WHERE depends_on_task_id = $1',
    [taskId]
  );

  return deps?.map(d => d.task_id) || [];
}

/**
 * Get depth of task in dependency chain (for parent_task_id validation)
 * Subtasks: parent_task_id depth should not exceed 1 (no grandparents)
 * @param taskId - Task ID
 * @returns Depth in hierarchy
 */
export async function getTaskHierarchyDepth(taskId: string): Promise<number> {
  let depth = 0;
  let currentId: string | null = taskId;

  while (currentId) {
    const parent: { parent_task_id: string | null } | null = await queryOne<{ parent_task_id: string | null }>(
      'SELECT parent_task_id FROM tasks WHERE id = $1',
      [currentId]
    );

    if (!parent || !parent.parent_task_id) {
      break;
    }

    currentId = parent.parent_task_id;
    depth++;
  }

  return depth;
}
