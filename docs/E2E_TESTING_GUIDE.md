# Task Management Enterprise Expansion - E2E Testing Guide

## Overview
Comprehensive end-to-end testing for PHASE 1 Task Management features (Subtasks, Time Tracking, Followers, Comments).

---

## 1. SUBTASKS TESTING

### 1.1 Create Subtask
**Test Case:** User can create a new subtask for a task
- [ ] Open task detail modal
- [ ] Click "Subtasks" tab
- [ ] Click "Thêm Subtask" button
- [ ] Fill in subtask title (required)
- [ ] Fill in subtask description (optional)
- [ ] Assign to a user (optional)
- [ ] Set due date (optional)
- [ ] Click "Tạo Subtask"
- [ ] Verify subtask appears in list immediately
- [ ] Verify completion percentage updates

### 1.2 Update Subtask Status
**Test Case:** User can change subtask status
- [ ] In Subtasks tab, find a subtask
- [ ] Click status dropdown (todo/in_progress/done/cancelled)
- [ ] Change status to "in_progress"
- [ ] Verify status updates immediately
- [ ] Verify completion percentage updates
- [ ] Try all 4 status options

### 1.3 Delete Subtask
**Test Case:** User can delete a subtask
- [ ] In Subtasks tab, find a subtask
- [ ] Click delete (trash) button
- [ ] Confirm deletion in modal
- [ ] Verify subtask is removed from list
- [ ] Verify completion percentage updates

### 1.4 Completion Percentage
**Test Case:** Completion % updates correctly
- [ ] Create 3 subtasks
- [ ] All subtasks: todo (0%)
- [ ] Mark 1 subtask done (33%)
- [ ] Mark 2 subtasks done (67%)
- [ ] Mark 3 subtasks done (100%)
- [ ] Verify percentages update correctly

---

## 2. TIME TRACKING TESTING

### 2.1 Create Time Entry
**Test Case:** User can log time for a task
- [ ] Open task detail modal
- [ ] Click "Thời Gian" tab
- [ ] Click "Thêm Time Entry"
- [ ] Select date_worked
- [ ] Enter duration_minutes (e.g., 60)
- [ ] Enter description
- [ ] Toggle is_billable checkbox
- [ ] Click "Lưu"
- [ ] Verify entry appears in list
- [ ] Verify total hours update in summary

### 2.2 Time Summary
**Test Case:** Time summary shows correct totals
- [ ] Create entries: 60min (billable), 30min (not billable)
- [ ] Total should show: 1.5 hours
- [ ] Billable should show: 1 hour
- [ ] Entry count should show: 2
- [ ] Verify UI displays correctly

### 2.3 Delete Time Entry
**Test Case:** User can delete a time entry
- [ ] In Time Tracking tab, find an entry
- [ ] Click delete button
- [ ] Verify entry is removed
- [ ] Verify summary totals update

---

## 3. FOLLOWERS TESTING

### 3.1 Follow Task
**Test Case:** User can follow a task
- [ ] Open task detail modal
- [ ] Click "Theo Dõi" tab
- [ ] Click "Theo dõi task" button (heart icon)
- [ ] Verify button changes to filled red heart
- [ ] Verify follower count increases by 1
- [ ] Verify current user appears in follower list

### 3.2 Auto-Follow on Create
**Test Case:** Task creator auto-follows created task
- [ ] Create a new task
- [ ] Open task detail modal
- [ ] Click "Theo Dõi" tab
- [ ] Verify creator is in follower list automatically
- [ ] Verify button shows as "following"

### 3.3 Unfollow Task
**Test Case:** User can unfollow a task
- [ ] In "Theo Dõi" tab, click heart button again
- [ ] Verify button changes to unfilled heart
- [ ] Verify follower count decreases
- [ ] Verify user removed from follower list

### 3.4 Remove Follower (Manager)
**Test Case:** Manager can remove any follower
- [ ] As manager, open "Theo Dõi" tab
- [ ] Find a follower in list
- [ ] Click "Bỏ" button
- [ ] Verify follower removed from list
- [ ] Non-managers should NOT see "Bỏ" button for other users

---

## 4. COMMENTS TESTING

### 4.1 Create Public Comment
**Test Case:** User can create a public comment
- [ ] Open task detail modal
- [ ] Click "Bình Luận" tab
- [ ] Click "Thêm bình luận" button
- [ ] Type comment content
- [ ] Ensure "Chỉ nội bộ" is NOT checked
- [ ] Click "Bình luận"
- [ ] Verify comment appears in list
- [ ] Verify user name and timestamp shown

### 4.2 Create Internal Comment
**Test Case:** User can create an internal comment
- [ ] In "Bình Luận" tab, click "Thêm bình luận"
- [ ] Type comment content
- [ ] Check "Chỉ nội bộ" checkbox
- [ ] Click "Bình luận"
- [ ] Verify comment appears with "Nội bộ" badge
- [ ] Log in as different user (not creator/assignee/manager)
- [ ] Verify internal comment is NOT visible to them

### 4.3 @Mention Support
**Test Case:** User can mention other users in comments
- [ ] In "Bình Luận" tab, click "Thêm bình luận"
- [ ] Type: "Xin chào @[username]"
- [ ] Click "Bình luận"
- [ ] Verify comment created successfully
- [ ] Verify mentioned user auto-follows task (if not already)
- [ ] Verify mentioned user receives notification

### 4.4 Delete Comment (Soft Delete)
**Test Case:** User can soft delete their comment
- [ ] Create a comment as user A
- [ ] Click delete (trash) button on the comment
- [ ] Verify comment shows "[Bình luận đã bị xóa]"
- [ ] Verify comment still in list (soft delete)
- [ ] As manager, verify option to permanently delete

### 4.5 Delete Comment (Permanent Delete)
**Test Case:** Manager can permanently delete comment
- [ ] As manager, find a soft-deleted comment
- [ ] Right-click or find delete option
- [ ] Select "Xóa vĩnh viễn"
- [ ] Verify comment completely removed from list

### 4.6 Edit Comment
**Test Case:** User can edit their comment
- [ ] Hover over comment (desktop) or tap (mobile)
- [ ] Click edit (pencil) button
- [ ] Modal should appear for editing
- [ ] Update comment content
- [ ] Click "Cập nhật"
- [ ] Verify comment updated
- [ ] Verify "(sửa lần cuối: ...)" indicator shown

---

## 5. INTEGRATION TESTING

### 5.1 Follower + Comment Integration
**Test Case:** Following changes with comments
- [ ] Follow a task
- [ ] Add a comment (should work)
- [ ] Unfollow the task
- [ ] Verify you still see your comment (author always sees)
- [ ] Verify follower count correct

### 5.2 @Mention + Follower Integration
**Test Case:** @mention auto-follows mentioned user
- [ ] As User A, open task detail modal
- [ ] Create comment: "@User B something"
- [ ] Switch to User B account
- [ ] Check "Theo Dõi" tab
- [ ] Verify User B now in follower list

### 5.3 Complete Task Flow
**Test Case:** Create task → subtasks → time → comments → followers
- [ ] Create new task "Test Task"
- [ ] Add 2 subtasks
- [ ] Log 2 hours of time
- [ ] Add comment: "@Manager Review please"
- [ ] Verify manager auto-followed
- [ ] Verify manager can see comment
- [ ] Verify all tabs functional

---

## 6. MOBILE TESTING

### 6.1 Mobile Tab Navigation
**Test Case:** Tabs responsive on mobile
- [ ] Resize browser to mobile (375px width)
- [ ] Verify tab bar scrolls horizontally
- [ ] Verify icons visible, text hidden on small screens
- [ ] Verify all tabs clickable
- [ ] All content visible and readable

### 6.2 Mobile Buttons
**Test Case:** Buttons touch-friendly on mobile
- [ ] Verify button min-height ≥ 44px
- [ ] Verify active state provides feedback
- [ ] Verify text truncates appropriately
- [ ] Verify no horizontal scrolling within forms

### 6.3 Mobile Comments
**Test Case:** Comment form responsive
- [ ] Create comment on mobile
- [ ] Verify textarea large enough to type
- [ ] Verify submit/cancel buttons full width
- [ ] Verify all text readable without zoom

---

## 7. PERMISSION TESTING

### 7.1 Task Creator Permissions
**Test Case:** Creator has full permissions
- [ ] As creator, verify can edit all fields
- [ ] Verify can see all comments (public + internal)
- [ ] Verify can see followers list
- [ ] Verify can create/edit/delete subtasks
- [ ] Verify can log time

### 7.2 Task Assignee Permissions
**Test Case:** Assignee has limited permissions
- [ ] As assignee, verify can create comments
- [ ] Verify can see internal comments
- [ ] Verify can follow/unfollow
- [ ] Verify can log time (own entries only)
- [ ] Verify cannot delete others' comments

### 7.3 Manager Permissions
**Test Case:** Manager has elevated permissions
- [ ] As manager, verify can manage followers
- [ ] Verify can delete any comment
- [ ] Verify can see all internal comments
- [ ] Verify can remove other followers

### 7.4 Regular Employee Permissions
**Test Case:** Regular employees have basic permissions
- [ ] Create task assigned to someone else
- [ ] As employee not involved, verify limited access
- [ ] Verify cannot see internal comments
- [ ] Verify can follow task
- [ ] Verify can create public comments

---

## 8. EDGE CASES

### 8.1 Empty States
- [ ] Task with no subtasks
- [ ] Task with no time entries
- [ ] Task with no followers
- [ ] Task with no comments

### 8.2 Large Data
- [ ] Create 50+ comments (test pagination)
- [ ] Create 20+ subtasks (test scrolling)
- [ ] Create 100+ time entries (test performance)
- [ ] Verify performance acceptable

### 8.3 Concurrent Operations
- [ ] Open same task in 2 tabs
- [ ] Add comment in tab 1, verify appears in tab 2 (F5 refresh)
- [ ] Edit task in modal, verify saved correctly
- [ ] Verify no data corruption

---

## 9. PERFORMANCE BENCHMARKS

| Operation | Target | Pass/Fail |
|-----------|--------|-----------|
| Load task detail modal | <500ms | [ ] |
| Create comment | <1000ms | [ ] |
| Load 50 comments | <2000ms | [ ] |
| Follow/unfollow | <500ms | [ ] |
| Change subtask status | <500ms | [ ] |

---

## 10. BROWSER COMPATIBILITY

- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Chrome (Android)
- [ ] Mobile Safari (iOS)

---

## Execution Notes

**Date Tested:** ___________
**Tester:** ___________
**Environment:** [development/staging/production]

**Summary:**
- Total Test Cases: 42
- Passed: _____ / 42
- Failed: _____ / 42
- Blocked: _____ / 42

**Issues Found:**
1. _______________
2. _______________
3. _______________

**Sign-off:** ___________
