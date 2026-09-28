// pdfmake không kèm type cho các đường dẫn build/*; nạp động nên chỉ cần khai báo any.
declare module 'pdfmake/build/pdfmake' {
  const pdfMake: any;
  export default pdfMake;
}
declare module 'pdfmake/build/vfs_fonts' {
  const vfs: any;
  export default vfs;
}
