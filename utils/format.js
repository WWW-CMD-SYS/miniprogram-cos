/**
 * 格式化工具函数
 */

/**
 * 格式化文件大小
 */
export const formatSize = (size) => {
  if (!size) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log10(size) / 3);
  const index = Math.min(i, units.length - 1);
  return (size / Math.pow(1024, index)).toFixed(1) + ' ' + units[index];
};

/**
 * 格式化日期时间
 */
export const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

/**
 * 获取文件扩展名
 */
export const getExt = (filename) => {
  if (!filename) return '';
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
};

/**
 * 判断文件类型
 */
export const getFileType = (filename) => {
  if (!filename) return 'unsupported';
  const ext = getExt(filename);

  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico', 'tiff', 'tif'];
  if (imageExts.includes(ext)) return 'image';

  if (ext === 'pdf') return 'pdf';

  const officeExts = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp'];
  if (officeExts.includes(ext)) return 'office';

  const textExts = ['txt', 'md', 'csv', 'json', 'xml', 'html', 'htm', 'css', 'js', 'ts', 'log', 'yaml', 'yml'];
  if (textExts.includes(ext)) return 'text';

  return 'unsupported';
};

/**
 * 获取存储类型显示文本
 */
export const getStorageText = (storageClass) => {
  const textMap = {
    'STANDARD': '标准存储',
    'STANDARD_IA': '低频存储',
    'ARCHIVE': '归档存储',
    'DEEP_ARCHIVE': '深度归档',
    'INTELLIGENT_TIERING': '智能分层存储',
    'MAZ_STANDARD': '多AZ标准存储',
    'MAZ_STANDARD_IA': '多AZ低频存储',
    'MAZ_INTELLIGENT_TIERING': '多AZ智能分层'
  };
  return textMap[storageClass] || storageClass || '-';
};

/**
 * 获取存储类型的标签主题
 */
export const getStorageTheme = (storageClass) => {
  const themeMap = {
    'STANDARD': 'primary',
    'STANDARD_IA': 'warning',
    'ARCHIVE': 'default',
    'DEEP_ARCHIVE': 'danger',
    'INTELLIGENT_TIERING': 'success',
    'MAZ_STANDARD': 'primary',
    'MAZ_STANDARD_IA': 'warning',
    'MAZ_INTELLIGENT_TIERING': 'success'
  };
  return themeMap[storageClass] || 'default';
};
