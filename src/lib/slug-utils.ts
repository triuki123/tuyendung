/**
 * Generate a URL-friendly slug from text
 * - Converts to lowercase
 * - Replaces spaces with hyphens
 * - Handles Vietnamese characters
 * - Removes special characters
 * - Removes consecutive hyphens
 */
export function generateSlug(text: string): string {
  if (!text || text.trim().length === 0) {
    return '';
  }

  return text
    .trim()
    .toLowerCase()
    // Handle Vietnamese characters
    .replace(/đ/g, 'd')
    .replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a')
    .replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e')
    .replace(/ì|í|ị|ỉ|ĩ/g, 'i')
    .replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o')
    .replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u')
    .replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y')
    .replace(/ç/g, 'c')
    .replace(/ñ/g, 'n')
    // Replace spaces and special characters with hyphen
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    // Remove consecutive hyphens
    .replace(/-+/g, '-')
    // Remove leading/trailing hyphens
    .replace(/^-+|-+$/g, '');
}
