import type { RegisteredField } from "./focus-registry";

export type GridDirection =
  | "UP"
  | "DOWN"
  | "LEFT"
  | "RIGHT"
  | "HOME"
  | "END"
  | "CTRL_HOME"
  | "CTRL_END"
  | "PAGE_UP"
  | "PAGE_DOWN";

export class EditableGridController {
  private sortGridFields(fields: RegisteredField[]): RegisteredField[] {
    return [...fields].sort((a, b) => {
      const rowA = a.rowIndex ?? 0;
      const rowB = b.rowIndex ?? 0;
      if (rowA !== rowB) return rowA - rowB;
      return (a.colIndex ?? 0) - (b.colIndex ?? 0);
    });
  }

  getRows(fields: RegisteredField[]): number[] {
    const rows = new Set<number>();
    for (const field of fields) {
      if (field.rowIndex !== undefined) rows.add(field.rowIndex);
    }
    return Array.from(rows).sort((a, b) => a - b);
  }

  getFieldAt(fields: RegisteredField[], row: number, col: number): RegisteredField | undefined {
    return fields.find((field) => field.rowIndex === row && field.colIndex === col && !field.disabled);
  }

  calculateNextField(
    fields: RegisteredField[],
    currentField: RegisteredField,
    direction: GridDirection,
  ): RegisteredField | undefined {
    const gridFields = this.sortGridFields(fields.filter((field) => !field.disabled));
    if (gridFields.length === 0) return undefined;

    const currentRow = currentField.rowIndex ?? 0;
    const currentCol = currentField.colIndex ?? 0;
    const rows = this.getRows(gridFields);
    if (rows.length === 0) return undefined;

    const minRow = rows[0];
    const maxRow = rows[rows.length - 1];
    const rowFields = gridFields.filter((field) => field.rowIndex === currentRow);
    const rowColumns = rowFields.map((field) => field.colIndex ?? 0).sort((a, b) => a - b);

    switch (direction) {
      case "LEFT": {
        const previousColumns = rowColumns.filter((column) => column < currentCol);
        if (previousColumns.length > 0) {
          return this.getFieldAt(gridFields, currentRow, previousColumns[previousColumns.length - 1]);
        }
        // Wrap to previous row's last column if available
        const previousRows = rows.filter((row) => row < currentRow);
        if (previousRows.length > 0) {
          const prevRow = previousRows[previousRows.length - 1];
          const prevRowFields = gridFields.filter((field) => field.rowIndex === prevRow);
          const prevRowCols = prevRowFields.map((field) => field.colIndex ?? 0).sort((a, b) => a - b);
          if (prevRowCols.length > 0) {
            return this.getFieldAt(gridFields, prevRow, prevRowCols[prevRowCols.length - 1]);
          }
        }
        return currentField;
      }
      case "RIGHT": {
        const nextColumns = rowColumns.filter((column) => column > currentCol);
        if (nextColumns.length > 0) {
          return this.getFieldAt(gridFields, currentRow, nextColumns[0]);
        }
        // Wrap to next row's first column if available
        const nextRows = rows.filter((row) => row > currentRow);
        if (nextRows.length > 0) {
          const nextRow = nextRows[0];
          const nextRowFields = gridFields.filter((field) => field.rowIndex === nextRow);
          const nextRowCols = nextRowFields.map((field) => field.colIndex ?? 0).sort((a, b) => a - b);
          if (nextRowCols.length > 0) {
            return this.getFieldAt(gridFields, nextRow, nextRowCols[0]);
          }
        }
        return currentField;
      }
      case "UP": {
        const previousRows = rows.filter((row) => row < currentRow);
        return previousRows.length > 0
          ? this.findClosestFieldInRow(gridFields, previousRows[previousRows.length - 1], currentCol)
          : currentField;
      }
      case "DOWN": {
        const nextRows = rows.filter((row) => row > currentRow);
        return nextRows.length > 0
          ? this.findClosestFieldInRow(gridFields, nextRows[0], currentCol)
          : currentField;
      }
      case "HOME":
        return rowColumns.length > 0 ? this.getFieldAt(gridFields, currentRow, rowColumns[0]) : currentField;
      case "END":
        return rowColumns.length > 0 ? this.getFieldAt(gridFields, currentRow, rowColumns[rowColumns.length - 1]) : currentField;
      case "CTRL_HOME": {
        const firstRowFields = gridFields.filter((field) => field.rowIndex === minRow);
        return firstRowFields[0] ?? currentField;
      }
      case "CTRL_END": {
        const lastRowFields = gridFields.filter((field) => field.rowIndex === maxRow);
        return lastRowFields[lastRowFields.length - 1] ?? currentField;
      }
      case "PAGE_UP":
        return this.findClosestFieldInRow(gridFields, Math.max(minRow, currentRow - 5), currentCol);
      case "PAGE_DOWN":
        return this.findClosestFieldInRow(gridFields, Math.min(maxRow, currentRow + 5), currentCol);
      default:
        return currentField;
    }
  }

  private findClosestFieldInRow(fields: RegisteredField[], row: number, targetCol: number): RegisteredField | undefined {
    const rowFields = fields.filter((field) => field.rowIndex === row);
    if (rowFields.length === 0) return undefined;
    const exactMatch = rowFields.find((field) => field.colIndex === targetCol);
    if (exactMatch) return exactMatch;
    return rowFields.reduce((closest, field) => {
      const closestDiff = Math.abs((closest.colIndex ?? 0) - targetCol);
      const fieldDiff = Math.abs((field.colIndex ?? 0) - targetCol);
      return fieldDiff < closestDiff ? field : closest;
    });
  }
}

export const editableGridController = new EditableGridController();
