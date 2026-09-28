import { supabase } from './supabase';
import {
  MOCK_USERS,
  MOCK_ASSETS,
  MOCK_TICKETS,
  MOCK_TASKS,
  MOCK_DELETE_REQUESTS,
  EMPLOYEES,
} from './mockData';

export async function migrateToSupabase() {
  try {
    console.log('🚀 Starting data migration to Supabase...');

    // 1. Migrate Users
    console.log('📤 Migrating users...');
    const { error: usersError } = await supabase.from('users').insert(
      MOCK_USERS.map(user => ({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        department: user.department,
        avatar: user.avatar,
        phone: user.phone,
      }))
    );
    if (usersError) console.error('❌ Users error:', usersError);
    else console.log('✓ Users migrated');

    // 2. Migrate Assets
    console.log('📤 Migrating assets...');
    const assetsToInsert = MOCK_ASSETS.map(asset => ({
      id: asset.id,
      code: asset.code,
      name: asset.name,
      category: asset.category,
      brand: asset.brand,
      model: asset.model,
      serial_number: asset.serialNumber,
      status: asset.status,
      assigned_to: asset.assignedTo,
      assigned_to_name: asset.assignedToName,
      department: asset.department,
      purchase_date: asset.purchaseDate,
      warranty_expiry: asset.warrantyExpiry,
      value: asset.value,
      condition: asset.condition,
      location: asset.location,
      notes: asset.notes,
      image_url: asset.imageUrl,
    }));

    const { error: assetsError } = await supabase
      .from('assets')
      .insert(assetsToInsert);
    if (assetsError) console.error('❌ Assets error:', assetsError);
    else console.log('✓ Assets migrated');

    // 3. Migrate Asset History
    console.log('📤 Migrating asset history...');
    for (const asset of MOCK_ASSETS) {
      if (asset.history && asset.history.length > 0) {
        const historyToInsert = asset.history.map(entry => ({
          id: entry.id,
          asset_id: asset.id,
          date: entry.date,
          action: entry.action,
          performed_by: entry.performedBy,
          note: entry.note,
        }));

        const { error: historyError } = await supabase
          .from('asset_history')
          .insert(historyToInsert);
        if (historyError) console.error(`❌ History error for ${asset.code}:`, historyError);
      }
    }
    console.log('✓ Asset history migrated');

    // 4. Migrate Tickets
    console.log('📤 Migrating tickets...');
    const { error: ticketsError } = await supabase.from('tickets').insert(
      MOCK_TICKETS.map(ticket => ({
        id: ticket.id,
        code: ticket.code,
        title: ticket.title,
        description: ticket.description,
        asset_code: ticket.assetCode,
        asset_name: ticket.assetName,
        priority: ticket.priority,
        status: ticket.status,
        created_by: ticket.createdBy,
        created_by_name: ticket.createdByName,
        assigned_to: ticket.assignedTo,
        assigned_to_name: ticket.assignedToName,
        created_at: ticket.createdAt,
        updated_at: ticket.updatedAt,
      }))
    );
    if (ticketsError) console.error('❌ Tickets error:', ticketsError);
    else console.log('✓ Tickets migrated');

    // 5. Migrate Tasks
    console.log('📤 Migrating tasks...');
    const { error: tasksError } = await supabase.from('tasks').insert(
      MOCK_TASKS.map(task => ({
        id: task.id,
        code: task.code,
        title: task.title,
        description: task.description,
        priority: task.priority,
        status: task.status,
        assigned_to: task.assignedTo,
        assigned_to_name: task.assignedToName,
        created_by: task.createdBy,
        due_date: task.dueDate,
        created_at: task.createdAt,
        related_asset: task.relatedAsset,
      }))
    );
    if (tasksError) console.error('❌ Tasks error:', tasksError);
    else console.log('✓ Tasks migrated');

    // 6. Migrate Delete Requests
    console.log('📤 Migrating delete requests...');
    const { error: deleteReqError } = await supabase
      .from('delete_requests')
      .insert(
        MOCK_DELETE_REQUESTS.map(req => ({
          id: req.id,
          asset_id: req.assetId,
          asset_code: req.assetCode,
          asset_name: req.assetName,
          requested_by: req.requestedBy,
          requested_by_name: req.requestedByName,
          requested_at: req.requestedAt,
          reason: req.reason,
          status: req.status,
          reviewed_by: req.reviewedBy,
          reviewed_at: req.reviewedAt,
          review_note: req.reviewNote,
        }))
      );
    if (deleteReqError) console.error('❌ Delete requests error:', deleteReqError);
    else console.log('✓ Delete requests migrated');

    console.log('✅ Migration completed successfully!');
    return { success: true };
  } catch (error) {
    console.error('❌ Migration failed:', error);
    return { success: false, error };
  }
}
