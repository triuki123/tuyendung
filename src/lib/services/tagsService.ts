import { query, queryOne, execute, buildInsert, buildUpdateById } from '@/lib/db';

export interface Tag {
  id: string;
  name: string;
  description?: string;
  color: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TagInput {
  name: string;
  description?: string;
  color?: string;
}

export const tagsService = {
  /**
   * Get all active tags
   */
  async getAllTags() {
    return query<Tag>(`SELECT * FROM tags WHERE is_active = true ORDER BY name ASC`);
  },

  /**
   * Get single tag by ID
   */
  async getTagById(id: string) {
    const data = await queryOne<Tag>(`SELECT * FROM tags WHERE id = $1`, [id]);
    if (!data) throw new Error(`Tag not found: ${id}`);
    return data;
  },

  /**
   * Create a new tag
   */
  async createTag(input: TagInput & { createdBy?: string }) {
    const { createdBy, ...tagData } = input;

    const { text, params } = buildInsert('tags', {
      ...tagData,
      color: tagData.color || '#6366f1',
      is_active: true,
    });
    const data = await queryOne<Tag>(text, params);
    if (!data) throw new Error('Failed to create tag');

    if (createdBy) {
      await this.addAuditLog({
        action: 'create',
        table: 'tags',
        record_id: data.id,
        changes: { created: tagData },
        created_by: createdBy,
      });
    }

    return data;
  },

  /**
   * Update a tag
   */
  async updateTag(id: string, updates: Partial<TagInput> & { updatedBy?: string }) {
    const { updatedBy, ...updateData } = updates;

    // fetch old data for audit log (ignore return value shape from old code)
    let oldData: Tag | null = null;
    try { oldData = await this.getTagById(id); } catch { /* tag may not exist */ }

    const { text, params } = buildUpdateById('tags', id, updateData);
    const data = await queryOne<Tag>(text, params);
    if (!data) throw new Error('Failed to update tag');

    if (updatedBy) {
      await this.addAuditLog({
        action: 'update',
        table: 'tags',
        record_id: id,
        changes: { before: oldData, after: updateData },
        created_by: updatedBy,
      });
    }

    return data;
  },

  /**
   * Deactivate a tag
   */
  async deactivateTag(id: string, deactivatedBy?: string) {
    const { text, params } = buildUpdateById('tags', id, { is_active: false });
    const data = await queryOne<Tag>(text, params);
    if (!data) throw new Error('Failed to deactivate tag');

    if (deactivatedBy) {
      await this.addAuditLog({
        action: 'deactivate',
        table: 'tags',
        record_id: id,
        changes: { is_active: false },
        created_by: deactivatedBy,
      });
    }

    return data;
  },

  /**
   * Assign tags to a user — replaces all existing tags for that user.
   */
  async assignTagsToUser(userId: string, tagIds: string[]) {
    await execute(`DELETE FROM user_tags WHERE user_id = $1`, [userId]);

    if (tagIds.length > 0) {
      // Build multi-row INSERT for all tag assignments in one query
      const placeholders = tagIds.map((_, i) => `($1, $${i + 2})`).join(', ');
      await execute(
        `INSERT INTO user_tags (user_id, tag_id) VALUES ${placeholders}`,
        [userId, ...tagIds]
      );
    }
  },

  /**
   * Get tags for a specific user. Returns the same shape as the old PostgREST
   * `.select('tags(*)')` embedding: an array of tag objects.
   */
  async getUserTags(userId: string) {
    const rows = await query<Tag>(
      `SELECT t.*
       FROM user_tags ut
       JOIN tags t ON t.id = ut.tag_id
       WHERE ut.user_id = $1`,
      [userId]
    );
    return rows;
  },

  /**
   * Get all users that have a specific tag. Returns user rows.
   */
  async getUsersByTag(tagId: string) {
    return query<any>(
      `SELECT u.*
       FROM user_tags ut
       JOIN users u ON u.id::text = ut.user_id::text
       WHERE ut.tag_id = $1`,
      [tagId]
    );
  },

  /**
   * Get all users that have any of the specified tags.
   */
  async getUsersByTags(tagIds: string[]) {
    const userIdRows = await query<{ user_id: string }>(
      `SELECT DISTINCT user_id FROM user_tags WHERE tag_id = ANY($1)`,
      [tagIds]
    );

    const userIds = userIdRows.map(r => r.user_id);
    if (userIds.length === 0) return [];

    return query<any>(`SELECT * FROM users WHERE id = ANY($1)`, [userIds]);
  },

  /**
   * Add audit log entry
   */
  async addAuditLog(log: {
    action: string;
    table: string;
    record_id: string;
    changes: any;
    created_by: string;
  }) {
    try {
      await execute(
        `INSERT INTO audit_logs (action, table_name, record_id, changes, created_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [log.action, log.table, log.record_id, JSON.stringify(log.changes), log.created_by]
      );
    } catch (err: any) {
      console.error('Audit log error:', err);
    }
  },
};
