export function isSupportedDocument(file) {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  return ['docx', 'pdf', 'txt'].includes(extension);
}
