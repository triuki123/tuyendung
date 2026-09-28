-- Migration 259: Chi Phi - bo sung mo ta cho tung dong chi tiet
-- Muc tieu:
--  - Luu duoc mo ta dai cho moi dong hang trong expense_lines.
--  - UI form phi de co o noi dung rong hon + them o mo ta rieng.

ALTER TABLE expense_lines
  ADD COLUMN IF NOT EXISTS mo_ta TEXT;
