/**
 * Seed Demo Data for PHASE 1 Testing
 *
 * This script populates the database with realistic test data
 * for manually testing PHASE 1 features (subtasks, time tracking, followers, comments).
 *
 * Usage:
 *   npx ts-node scripts/seed-demo-data.ts
 *
 * What it creates:
 * - 3 test users: alice, bob, charlie
 * - 5 tasks with different statuses
 * - Subtasks for each task (3-5 per task)
 * - Time entries for each subtask (2-4 hours)
 * - Followers (auto-follow creator/assignee)
 * - Comments with @mentions
 */

const { Pool, PoolClient } = require('pg');
import crypto from 'crypto';

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? true : false,
});

// Types
interface User {
  id: string;
  name: string;
  email: string;
}

interface Task {
  id: string;
  title: string;
  assignedTo: string;
  createdBy: string;
  status: string;
}

// Generate unique IDs
const generateId = (prefix: string): string => {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
};

// Helper to execute SQL
async function execute(client: PoolClient, sql: string, params: any[] = []): Promise<any> {
  try {
    const result = await client.query(sql, params);
    return result.rows;
  } catch (err) {
    console.error(`SQL Error: ${sql}`, err);
    throw err;
  }
}

// Main seed function
async function seedDemoData() {
  const client = await pool.connect();

  try {
    console.log('🌱 Starting demo data seed...\n');

    // 1. Create test users
    console.log('📝 Creating test users...');
    const users: User[] = [];

    const userNames = [
      { name: 'Alice Nguyễn', email: 'alice@company.com' },
      { name: 'Bob Trần', email: 'bob@company.com' },
      { name: 'Charlie Phạm', email: 'charlie@company.com' },
      { name: 'Diana Lê', email: 'diana@company.com' },
    ];

    for (const u of userNames) {
      const userId = generateId('user');
      users.push({
        id: userId,
        name: u.name,
        email: u.email,
      });
      console.log(`  ✓ Created user: ${u.name} (${userId})`);
    }

    // 2. Create tasks
    console.log('\n📋 Creating tasks...');
    const tasks: Task[] = [];

    const taskData = [
      {
        title: 'Thiết kế dashboard quản lý tài sản',
        assignedTo: users[0].id, // Alice
        createdBy: users[1].id, // Bob
        status: 'in_progress',
      },
      {
        title: 'Phát triển API asset tracking',
        assignedTo: users[1].id, // Bob
        createdBy: users[0].id, // Alice
        status: 'in_progress',
      },
      {
        title: 'Testing và QA giao diện người dùng',
        assignedTo: users[2].id, // Charlie
        createdBy: users[0].id, // Alice
        status: 'todo',
      },
      {
        title: 'Tài liệu kỹ thuật và training',
        assignedTo: users[3].id, // Diana
        createdBy: users[1].id, // Bob
        status: 'todo',
      },
      {
        title: 'Triển khai sản xuất (Production Deployment)',
        assignedTo: users[0].id, // Alice
        createdBy: users[0].id, // Alice
        status: 'done',
      },
    ];

    for (const t of taskData) {
      const taskId = generateId('task');
      tasks.push({
        id: taskId,
        title: t.title,
        assignedTo: t.assignedTo,
        createdBy: t.createdBy,
        status: t.status,
      });

      await execute(
        client,
        `INSERT INTO tasks (id, title, description, status, assigned_to, created_by, estimated_hours)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [taskId, t.title, `Demo task for testing PHASE 1 features`, t.status, t.assignedTo, t.createdBy, 20]
      );

      console.log(`  ✓ Created task: ${t.title}`);
    }

    // 3. Auto-follow task creators and assignees
    console.log('\n👥 Adding auto-followers...');
    for (const task of tasks) {
      // Creator follows
      await execute(
        client,
        `INSERT INTO task_followers (task_id, user_id, created_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT DO NOTHING`,
        [task.id, task.createdBy]
      );

      // Assignee follows
      if (task.assignedTo !== task.createdBy) {
        await execute(
          client,
          `INSERT INTO task_followers (task_id, user_id, created_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT DO NOTHING`,
          [task.id, task.assignedTo]
        );
      }
    }
    console.log(`  ✓ Added auto-followers for all tasks`);

    // 4. Create subtasks
    console.log('\n✓ Creating subtasks...');
    const subtaskTitles = [
      ['Wireframe thiết kế', 'Prototyping interactive', 'Code review & feedback', 'Responsive design mobile'],
      ['Design API endpoints', 'Database schema design', 'Authentication layer', 'Error handling'],
      ['Manual testing', 'Performance testing', 'Security testing', 'User acceptance testing', 'Bug fixes'],
      ['Write technical docs', 'Create training videos', 'User manual', 'API documentation'],
      ['Server configuration', 'Database migration', 'Deployment automation', 'Monitoring setup', 'Rollback plan'],
    ];

    let subtaskCount = 0;
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const titles = subtaskTitles[i];

      for (let j = 0; j < titles.length; j++) {
        const subtaskId = generateId('subtask');
        const subtasks = [users[0].id, users[1].id, users[2].id, users[3].id];
        const assignedTo = subtasks[j % subtasks.length];

        await execute(
          client,
          `INSERT INTO task_subtasks (id, task_id, title, description, status, assigned_to, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [
            subtaskId,
            task.id,
            titles[j],
            `Demo subtask for ${task.title}`,
            j === titles.length - 1 ? 'done' : j < 2 ? 'in_progress' : 'todo',
            assignedTo,
          ]
        );
        subtaskCount++;
      }
    }
    console.log(`  ✓ Created ${subtaskCount} subtasks`);

    // 5. Create time entries
    console.log('\n⏱️  Creating time entries...');
    let timeEntryCount = 0;

    for (const task of tasks) {
      const entries = Math.floor(Math.random() * 3) + 2; // 2-4 entries per task

      for (let i = 0; i < entries; i++) {
        const entryId = generateId('timeentry');
        const duration = [60, 120, 90, 150][Math.floor(Math.random() * 4)]; // 1, 1.5, 2, 2.5 hours
        const daysAgo = Math.floor(Math.random() * 7);
        const user = users[Math.floor(Math.random() * users.length)];

        await execute(
          client,
          `INSERT INTO task_time_entries (id, task_id, user_id, user_name, duration_minutes, date_worked, description, is_billable, created_at)
           VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '${daysAgo} days', $6, $7, NOW())`,
          [
            entryId,
            task.id,
            user.id,
            user.name,
            duration,
            `Working on ${task.title}`,
            Math.random() > 0.3, // 70% billable
          ]
        );
        timeEntryCount++;
      }
    }
    console.log(`  ✓ Created ${timeEntryCount} time entries`);

    // 6. Create comments with mentions
    console.log('\n💬 Creating comments...');
    let commentCount = 0;

    for (const task of tasks) {
      const comments = [
        {
          content: `Bắt đầu công việc trên ${task.title}`,
          isInternal: false,
          userId: task.createdBy,
          mentions: [],
        },
        {
          content: `@${users[0].name.split(' ')[0]} vui lòng review design này`,
          isInternal: false,
          userId: task.assignedTo,
          mentions: [users[0].id],
        },
        {
          content: `Hoàn thành phần này, sẵn sàng cho testing @${users[2].name.split(' ')[0]}`,
          isInternal: false,
          userId: task.assignedTo,
          mentions: [users[2].id],
        },
        {
          content: `Yêu cầu kiểm tra lại - có vài issue cần fix`,
          isInternal: true,
          userId: users[2].id,
          mentions: [task.createdBy],
        },
      ];

      for (const comment of comments) {
        const commentId = generateId('comment');

        await execute(
          client,
          `INSERT INTO task_comments (id, task_id, user_id, user_name, content, is_internal, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [
            commentId,
            task.id,
            comment.userId,
            users.find((u) => u.id === comment.userId)?.name || 'Unknown',
            comment.content,
            comment.isInternal,
          ]
        );

        // Add mentions
        for (const mentionedUserId of comment.mentions) {
          await execute(
            client,
            `INSERT INTO task_comment_mentions (comment_id, mentioned_user_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [commentId, mentionedUserId]
          );

          // Auto-follow mentioned user
          await execute(
            client,
            `INSERT INTO task_followers (task_id, user_id, created_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT DO NOTHING`,
            [task.id, mentionedUserId]
          );
        }

        commentCount++;
      }
    }
    console.log(`  ✓ Created ${commentCount} comments`);

    // 7. Summary
    console.log('\n✅ Demo data seed complete!\n');
    console.log('📊 Summary:');
    console.log(`  - Users: ${users.length}`);
    console.log(`  - Tasks: ${tasks.length}`);
    console.log(`  - Subtasks: ${subtaskCount}`);
    console.log(`  - Time Entries: ${timeEntryCount}`);
    console.log(`  - Comments: ${commentCount}`);
    console.log('\n🚀 You can now:');
    console.log('  1. Open the app and navigate to Tasks');
    console.log('  2. Click on any task to see all PHASE 1 features');
    console.log('  3. Try creating/editing subtasks, time entries, comments');
    console.log('  4. Follow/unfollow tasks and test notifications');
    console.log('  5. Use @mentions in comments to notify team members\n');

    console.log('Test Users (use these for login):');
    users.forEach((u, i) => {
      console.log(`  ${i + 1}. ${u.name} (${u.email})`);
    });
  } catch (err) {
    console.error('❌ Seed failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run
seedDemoData();
