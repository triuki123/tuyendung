/** Group numeric salary inputs without changing their value or free-text terms. */
export function formatJdSalary(value: string): string {
  if (!/^[\d.\s]+$/.test(value)) return value;
  const digits = value.replace(/[.\s]/g, '');
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Presentation only: retain stored amounts and existing textual salary terms. */
export function displayJdSalary(value: string): string {
  const salary = value.trim();
  if (!salary) return 'Chưa cập nhật';
  if (/^[\d.\s]+$/.test(salary)) return `${formatJdSalary(salary)} Triệu Đồng`;
  return salary;
}
