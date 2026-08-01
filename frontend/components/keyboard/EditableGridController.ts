import type { RegisteredField } from "./focus-registry";

export class EditableGridController {
  private sortGridFields(fields: RegisteredField[]): RegisteredField[] {
    return [...fields].sort((a, b) => {
      const rA = a.rowIndex ?? 0;
      const rB = b.rowIndex ?? 0;
      if (rA !== rB) return rA - rB;
      return (a.colIndex ?? 0) - (b.colIndex ?? 0);
    });
  }

  getRows(fields: RegisteredField[]): number[] {
    const set = new Set<number>();
    for (const f of fields) {
      if (f.rowIndex !== undefined) set.add(f.rowIndex);
    }
    return Array.from(set).sort((a, b) => a - b);
  }


  getFieldAt(fields: RegisteredField[], row: number, col: number): RegisteredField | undefined {
    return fields.find((f) => f.rowIndex === row && f.colIndex === col && !f.disabled);
  }


  calculateNextField(
    fields: RegisteredField[],
    currentField: RegisteredField,
    direction: "UP" | "DOWN" | "LEFT" | "RIGHT" | "HOME" | "END" | "CTRL_HOME" | "CTRL_END" | "PAGE_UP" | "PAGE_DOWN"
  ): RegisteredField | undefined {
    const gridFields = this.sortGridFields(fields.filter((f) => !f.disabled));
    if (gridFields.length === 0) return undefined;

    const currRow = currentField.rowIndex ?? 0;
    const currCol = currentField.colIndex ?? 0;
    const rows = this.getRows(gridFields);
    if (rows.length === 0) return undefined;

    const minRow = rows[0];
    const maxRow = rows[rows.length - 1];

    const rowFields = gridFields.filter((f) => f.rowIndex === currRow);
    const sortedRowCols = rowFields.map((f) => f.colIndex ?? 0).sort((a, b) => a - b);

    switch (direction) {
      case "LEFT": {
        const prevCols = sortedRowCols.filter((c) => c < currCol);
        if (prevCols.length > 0) {
          const targetCol = prevCols[prevCols.length - 1];
          return this.getFieldAt(gridFields, currRow, targetCol);
        }
        // Non-wrapping: stay at left boundary
        return currentField;
      }

      case "RIGHT": {
        const nextCols = sortedRowCols.filter((c) => c > currCol);
        if (nextCols.length > 0) {
          const targetCol = nextCols[0];
          return this.getFieldAt(gridFields, currRow, targetCol);
        }
        // Non-wrapping: stay at right boundary
        return currentField;
      }

      case "UP": {
        const prevRows = rows.filter((r) => r < currRow);
        if (prevRows.length > 0) {
          const targetRow = prevRows[prevRows.length - 1];
          // Try same column in prev row, or closest available column
          return this.findClosestFieldInRow(gridFields, targetRow, currCol);
        }
        return currentField;
      }

      case "DOWN": {
        const nextRows = rows.filter((r) => r > currRow);
        if (nextRows.length > 0) {
          const targetRow = nextRows[0];
          return this.findClosestFieldInRow(gridFields, targetRow, currCol);
        }
        return currentField;
      }

      case "HOME": {
        if (sortedRowCols.length > 0) {
          return this.getFieldAt(gridFields, currRow, sortedRowCols[0]);
        }
        return currentField;
      }

      case "END": {
        if (sortedRowCols.length > 0) {
          return this.getFieldAt(gridFields, currRow, sortedRowCols[sortedRowCols.length - 1]);
        }
        return currentField;
      }

      case "CTRL_HOME": {
        const firstRowFields = gridFields.filter((f) => f.rowIndex === minRow);
        if (firstRowFields.length > 0) return firstRowFields[0];
        return currentField;
      }

      case "CTRL_END": {
        const lastRowFields = gridFields.filter((f) => f.rowIndex === maxRow);
        if (lastRowFields.length > 0) return lastRowFields[lastRowFields.length - 1];
        return currentField;
      }

      case "PAGE_UP": {
        const targetRow = Math.max(minRow, currRow - 5);
        return this.findClosestFieldInRow(gridFields, targetRow, currCol);
      }

      case "PAGE_DOWN": {
        const targetRow = Math.min(maxRow, currRow + 5);
        return this.findClosestFieldInRow(gridFields, targetRow, currCol);
      }

      default:
        return currentField;
    }
  }

  private findClosestFieldInRow(fields: RegisteredField[], row: number, targetCol: number): RegisteredField | undefined {
    const rowFields = fields.filter((f) => f.rowIndex === row);
    if (rowFields.length === 0) return undefined;

    // Exact col match
    const exact = rowFields.find((f) => f.colIndex === targetCol);
    if (exact) return exact;

    // Closest col
    return rowFields.reduce((closest, f) => {
      const distF = Math.abs((f.colIndex ?? 0) - targetCol);
      const distC = Math.abs((closest.colIndex ?? 0) - targetCol);
      return distF < distC ? f : closest;
    }, rowFields[0]);
  }
}

export const editableGridController = new EditableGridController();
