# PHASE 1: End-to-End Test Execution Guide

**Quick Reference for Manual Testing**  
**Time Estimate:** 45-60 minutes for full coverage  
**Browser:** Chrome, Firefox (latest versions)

---

## 📋 Pre-Test Setup

### 1. Prepare Environment
```bash
# Start development server
npm run dev

# In another terminal, seed demo data
npx ts-node scripts/seed-demo-data.ts
```

### 2. Open Application
- Navigate to: `http://localhost:4028/tasks`
- Login with test user: alice@company.com (or any test user from seed output)
- Open browser DevTools (F12) for network inspection

### 3. Create Test Checklist
- Print this guide or open in split-screen
- Have a spreadsheet ready to track results
- Note: ✅ Pass, ❌ Fail, ⚠️ Issue, 🔍 Further Testing

---

## 🧪 TEST SUITE 1: SUBTASKS (10 minutes)

### Test 1.1: Create Subtask
**Steps:**
1. Click on task "Thiết kế dashboard quản lý tài sản"
2. Click "Subtasks" tab
3. Click "Thêm Subtask" button
4. Fill in:
   - Title: "Test subtask creation"
   - Description: "Demo subtask"
   - Assignee: Any user
   - Due date: Tomorrow
5. Click "Tạo Subtask"

**Expected Result:**
- ✅ Subtask appears in list immediately
- ✅ Completion percentage updates (visible in tab badge)
- ✅ Assigned user appears in assignee field
- ❌ No error toast should appear

**Note:** Take screenshot of completed subtask list

---

### Test 1.2: Change Subtask Status
**Steps:**
1. In Subtasks tab, find a "todo" subtask
2. Click the status dropdown
3. Select "in_progress"
4. Verify it changes immediately

**Expected Result:**
- ✅ Status changes to "in_progress" (visual indicator changes)
- ✅ Completion % does NOT change (only "done" counts)
- ✅ Try all 4 statuses: todo → in_progress → done → cancelled
- ✅ When marked "done", completion % increases

**Test Data:** With 5 subtasks total, each "done" should increase % by 20%

---

### Test 1.3: Delete Subtask
**Steps:**
1. Find a subtask (preferably with status "todo")
2. Hover over it (desktop) or tap (mobile)
3. Click trash/delete button
4. Confirm in modal

**Expected Result:**
- ✅ Subtask is removed from list
- ✅ Completion % recalculates immediately
- ✅ If you delete a "done" subtask, % decreases

---

### Test 1.4: Completion Percentage Calculation
**Steps:**
1. Note current subtask count and completion %
2. Manually calculate expected %: (done_count / total_count) * 100
3. Change subtasks to hit known percentages:
   - 0 done / 4 total = 0%
   - 1 done / 4 total = 25%
   - 2 done / 4 total = 50%
   - 3 done / 4 total = 75%
   - 4 done / 4 total = 100%

**Expected Result:**
- ✅ Completion % exactly matches calculation
- ✅ Badge in tab shows correct percentage
- ✅ Parent task's "actual_hours" may update based on time entries

---

## ⏱️ TEST SUITE 2: TIME TRACKING (8 minutes)

### Test 2.1: Create Time Entry
**Steps:**
1. Click "Thời Gian" tab
2. Click "Thêm Time Entry" button
3. Fill in:
   - Date: Today
   - Duration: 90 (minutes)
   - Description: "Testing time entry feature"
   - Billable: Check or uncheck randomly
4. Click "Lưu"

**Expected Result:**
- ✅ Time entry appears in list immediately
- ✅ Duration displays as "1.5 giờ" (hours formatted)
- ✅ Billable checkbox reflects your selection
- ✅ Summary updates: "Tổng: X giờ | Có thể tính tiền: Y giờ"

---

### Test 2.2: Time Summary Accuracy
**Steps:**
1. View all time entries in "Thời Gian" tab
2. Manually sum:
   - Total hours = sum of all duration_minutes / 60
   - Billable hours = sum of is_billable entries / 60
3. Compare with displayed summary

**Example:**
- Entry 1: 60 min, billable → 1 hour billable
- Entry 2: 30 min, not billable → 0.5 hour total, 0 billable
- Entry 3: 90 min, billable → 1.5 hour billable
- **Expected Summary:** Tổng: 2.5 giờ | Có thể tính tiền: 2.5 giờ

**Expected Result:**
- ✅ Summary shows correct total
- ✅ Summary shows correct billable amount
- ✅ Entry count is accurate

---

### Test 2.3: Delete Time Entry
**Steps:**
1. Find a time entry
2. Click delete/trash button
3. Verify entry is removed

**Expected Result:**
- ✅ Entry is removed from list
- ✅ Summary totals update immediately
- ✅ Mark as soft delete (gray out and show timestamp if expanded)

---

## 👥 TEST SUITE 3: FOLLOWERS (10 minutes)

### Test 3.1: Follow Task
**Steps:**
1. Click "Theo Dõi" tab
2. Note follower count (should be 2-3 auto-follows)
3. Click "Theo dõi task" button (heart icon)
4. Observe changes

**Expected Result:**
- ✅ Heart icon becomes filled/red
- ✅ Button text changes to "Bỏ theo dõi"
- ✅ Follower count increases by 1
- ✅ Your user appears in follower list with timestamp "Hôm nay"

---

### Test 3.2: Auto-Follow on Task Creation
**Steps:**
1. Create a new task (if you haven't)
2. Immediately click "Theo Dõi" tab
3. Check follower list

**Expected Result:**
- ✅ You (task creator) appear in follower list
- ✅ Task assignee appears in follower list
- ✅ Count shows 2 (or 1 if creator = assignee)

---

### Test 3.3: Unfollow Task
**Steps:**
1. In "Theo Dõi" tab, click heart button again
2. Observe changes

**Expected Result:**
- ✅ Heart icon becomes unfilled
- ✅ Button text changes to "Theo dõi task"
- ✅ Follower count decreases by 1
- ✅ You are removed from follower list

---

### Test 3.4: Manager Remove Follower (if you're a manager)
**Steps:**
1. As manager user, open task's "Theo Dõi" tab
2. Find a follower in list
3. Click "Bỏ" button next to their name

**Expected Result:**
- ✅ Follower is removed from list
- ✅ Follower count decreases
- **Note:** Non-manager users should NOT see "Bỏ" button

---

## 💬 TEST SUITE 4: COMMENTS (15 minutes)

### Test 4.1: Create Public Comment
**Steps:**
1. Click "Bình Luận" tab
2. Click "Thêm bình luận" button
3. Type: "Testing public comment feature"
4. Ensure "Chỉ nội bộ" checkbox is NOT checked
5. Click "Bình luận"

**Expected Result:**
- ✅ Comment appears immediately in list
- ✅ Shows your name and timestamp
- ✅ No "Nội bộ" badge visible
- ✅ Comment count increases

---

### Test 4.2: Create Internal Comment
**Steps:**
1. Click "Thêm bình luận" again
2. Type: "Internal note for team leads only"
3. CHECK "Chỉ nội bộ" checkbox
4. Click "Bình luận"

**Expected Result:**
- ✅ Comment appears with "Nội bộ" badge
- ✅ Comment is visible to you
- **Verification (in separate tab):**
  - Login as regular employee (not involved in task)
  - Open same task
  - Internal comment should NOT be visible
  - Internal comment still counts in total comment count (but hidden)

---

### Test 4.3: @Mention Support
**Steps:**
1. Click "Thêm bình luận"
2. Type: "Xin chào @Alice, please check this"
3. Click "Bình luận"
4. Check notification system

**Expected Result:**
- ✅ Comment created successfully
- ✅ @Alice appears with mention indicator
- ✅ Alice auto-follows task (check Followers tab)
- ✅ Alice receives notification (check bell icon or notification panel)
- 💡 **Tip:** Mention multiple users: "@Alice @Bob check this"

---

### Test 4.4: Edit Comment
**Steps:**
1. Find your comment
2. Hover over it (desktop) or look for edit icon
3. Click pencil/edit button
4. Modal should appear with edit form
5. Change content: "Updated: Testing comment edit"
6. Click "Cập nhật"

**Expected Result:**
- ✅ Comment content updates immediately
- ✅ Shows "(sửa lần cuối)" indicator
- ✅ Timestamp of edit visible on hover/expand
- ✅ Only comment author or manager can edit

---

### Test 4.5: Delete Comment (Soft Delete)
**Steps:**
1. Create a new comment
2. Find delete/trash button on comment
3. Click it
4. Confirm deletion

**Expected Result:**
- ✅ Comment shows "[Bình luận đã bị xóa]"
- ✅ Comment still in list (soft delete)
- ✅ Original author/timestamp still visible
- ✅ Content is hidden
- **Manager Only:** Should see "Xóa vĩnh viễn" option to permanently delete

---

### Test 4.6: Permanent Delete (Manager Only)
**Steps:**
1. As manager, find soft-deleted comment
2. Look for "Xóa vĩnh viễn" or right-click option
3. Confirm permanent deletion

**Expected Result:**
- ✅ Comment completely removed from list
- ✅ Comment no longer appears even in soft-delete state
- ✅ Regular users cannot see this option

---

## 🔗 TEST SUITE 5: INTEGRATION (5 minutes)

### Test 5.1: @Mention + Follower Integration
**Steps:**
1. Open a task
2. Check "Theo Dõi" tab - note follower count
3. Create comment: "@[Someone Not Following] please review"
4. Return to "Theo Dõi" tab
5. Verify mentioned user now appears

**Expected Result:**
- ✅ Mentioned user auto-follows task
- ✅ Follower count increases
- ✅ Mentioned user receives notification

---

### Test 5.2: Comment + Subtask Integration
**Steps:**
1. In Subtasks tab, check completion %
2. Create comment: "Marking subtask X as complete"
3. Change a subtask to "done"
4. Return to Comments tab
5. Comment should be visible with new completion %

**Expected Result:**
- ✅ All features work together independently
- ✅ Updating one feature (subtask status) doesn't break others (comments)
- ✅ No console errors

---

## 📱 TEST SUITE 6: MOBILE RESPONSIVENESS (5 minutes)

### Test 6.1: Resize Browser to Mobile (375px)
**Steps:**
1. Open DevTools (F12)
2. Click device toolbar icon
3. Select "iPhone SE" or set width to 375px
4. Navigate through each tab

**Expected Result:**
- ✅ Tab bar shows icons (labels hidden on mobile)
- ✅ All buttons have min-height ≥ 32px (touch-friendly)
- ✅ Forms are full-width, no horizontal scroll
- ✅ Text is readable without zoom
- ✅ Modals/dialogs fit on screen

---

### Test 6.2: Mobile Comment Form
**Steps:**
1. On mobile view, click "Thêm bình luận"
2. Type a comment
3. Verify submit/cancel buttons are accessible

**Expected Result:**
- ✅ Textarea is large enough to see text
- ✅ Submit/cancel buttons don't overlap
- ✅ Full width layout
- ✅ Can submit without desktop scrolling

---

## 🔐 TEST SUITE 7: PERMISSIONS (5 minutes)

### Test 7.1: Comment Visibility for Non-Creator
**Steps:**
1. As User A, create internal comment on task
2. Logout and login as User B (not involved)
3. View same task

**Expected Result:**
- ✅ User A can see their internal comment
- ✅ User B cannot see User A's internal comment
- ✅ But internal comment still counts in total count

---

### Test 7.2: Edit Permission
**Steps:**
1. As User A, create comment
2. Try to edit it (should work)
3. Logout and login as User B
4. Try to edit User A's comment

**Expected Result:**
- ✅ User A can edit their comment
- ✅ User B cannot edit User A's comment
- ✅ Manager can edit any comment (test if you have manager access)

---

## ⚡ QUICK PERFORMANCE CHECKS

| Operation | Target | Status |
|-----------|--------|--------|
| Load task detail modal | <500ms | [ ] Pass / [ ] Fail |
| Create comment | <1000ms | [ ] Pass / [ ] Fail |
| Follow/unfollow | <500ms | [ ] Pass / [ ] Fail |
| Change subtask status | <500ms | [ ] Pass / [ ] Fail |
| Update time entry | <1000ms | [ ] Pass / [ ] Fail |

**How to measure:** Open DevTools → Network tab → Sort by Duration

---

## 📊 Test Execution Record

**Date:** _______________  
**Tester:** _______________  
**Environment:** Development / Staging / Production

### Results Summary

| Test Suite | Total Cases | Passed | Failed | Status |
|-----------|------------|--------|--------|--------|
| Subtasks | 4 | [ ] | [ ] | [ ] |
| Time Tracking | 3 | [ ] | [ ] | [ ] |
| Followers | 4 | [ ] | [ ] | [ ] |
| Comments | 6 | [ ] | [ ] | [ ] |
| Integration | 2 | [ ] | [ ] | [ ] |
| Mobile | 2 | [ ] | [ ] | [ ] |
| Permissions | 2 | [ ] | [ ] | [ ] |
| **TOTAL** | **23** | [ ] | [ ] | **[ ]** |

### Issues Found

1. **Issue:** _______________
   - **Steps to Reproduce:** _______________
   - **Expected:** _______________
   - **Actual:** _______________
   - **Severity:** 🔴 Critical / 🟠 Major / 🟡 Minor

2. **Issue:** _______________
   - (same format as above)

---

## ✅ Sign-Off

- [ ] All critical paths tested
- [ ] No blocker issues found
- [ ] Mobile responsiveness verified
- [ ] Permission model validated
- [ ] Performance acceptable
- [ ] Ready for production deployment

**Tester Signature:** _______________  
**Date:** _______________  
**Approved By:** _______________

---

## 🐛 Troubleshooting Common Issues

### Comments Not Showing
- [ ] Check tab loaded (look for "Bình Luận (N)" count)
- [ ] Try F5 refresh to reload data
- [ ] Check browser console for errors (F12)
- [ ] Verify task ID is correct in URL

### Subtask Completion % Not Updating
- [ ] Check that you're changing status to "done"
- [ ] Verify total count matches visible subtasks
- [ ] Try manual recalculation: (done_count / total_count) * 100
- [ ] Refresh page to verify

### @Mention Not Auto-Following
- [ ] Verify user exists in system
- [ ] Try exact username from dropdown
- [ ] Check Followers tab to confirm auto-follow worked
- [ ] Look for notification in bell icon

### Mobile Layout Broken
- [ ] Try different screen size (tablet 768px)
- [ ] Zoom to 100% (Ctrl+0)
- [ ] Clear browser cache (Ctrl+Shift+Delete)
- [ ] Try different browser (Chrome, Firefox, Safari)

---

**Last Updated:** 2026-06-01  
**Next Review:** When PHASE 2 starts
