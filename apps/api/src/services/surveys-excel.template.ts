import ExcelJS from 'exceljs';
import { SURVEY_EXCEL_COLUMNS, SURVEY_EXCEL_SHEET_NAMES } from './surveys-excel.types';

export async function createSurveyResultsTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  for (const sheetName of SURVEY_EXCEL_SHEET_NAMES) {
    const sheet = workbook.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] });
    const headers = SURVEY_EXCEL_COLUMNS[sheetName];
    sheet.addRow([...headers]).font = { bold: true };
    headers.forEach((header, index) => { sheet.getColumn(index + 1).width = Math.max(header.length + 2, 18); });
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
