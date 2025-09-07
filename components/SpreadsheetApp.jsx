import React, { useRef, useEffect } from 'react';
import { SpreadsheetComponent, SheetsDirective, SheetDirective, RangesDirective, RangeDirective, ColumnsDirective, ColumnDirective } from '@syncfusion/ej2-react-spreadsheet';
import '@syncfusion/ej2-base/styles/material.css';
import '@syncfusion/ej2-inputs/styles/material.css';
import '@syncfusion/ej2-buttons/styles/material.css';
import '@syncfusion/ej2-splitbuttons/styles/material.css';
import '@syncfusion/ej2-lists/styles/material.css';
import '@syncfusion/ej2-navigations/styles/material.css';
import '@syncfusion/ej2-popups/styles/material.css';
import '@syncfusion/ej2-dropdowns/styles/material.css';
import '@syncfusion/ej2-grids/styles/material.css';
import '@syncfusion/ej2-react-spreadsheet/styles/material.css';

const SpreadsheetApp = () => {
  const spreadsheetRef = useRef(null);

  // Sample initial data with headers and formulas
  const initialData = [
    { Name: 'Name', Phone: 'Phone', Product: 'Product', 'Per Unit Payment': 'Per Unit Payment', Completed: 'Completed', Payment: 'Payment', Advance: 'Advance', 'Payment Left': 'Payment Left' },
    { Name: '', Phone: '', Product: '', 'Per Unit Payment': '', Completed: '', Payment: '=D2*E2', Advance: '', 'Payment Left': '=F2-G2' },
  ];

  useEffect(() => {
    loadFromDatabase();
  }, []);

  const loadFromDatabase = () => {
    fetch('/api/spreadsheetdata')
      .then(response => response.json())
      .then(data => {
        if (data && spreadsheetRef.current) {
          spreadsheetRef.current.openFromJson({ file: data });
        } else if (spreadsheetRef.current) {
          spreadsheetRef.current.updateCell({ value: 'Name' }, 'A1');
          spreadsheetRef.current.updateCell({ value: 'Phone' }, 'B1');
          spreadsheetRef.current.updateCell({ value: 'Product' }, 'C1');
          spreadsheetRef.current.updateCell({ value: 'Per Unit Payment' }, 'D1');
          spreadsheetRef.current.updateCell({ value: 'Completed' }, 'E1');
          spreadsheetRef.current.updateCell({ value: 'Payment' }, 'F1');
          spreadsheetRef.current.updateCell({ value: 'Advance' }, 'G1');
          spreadsheetRef.current.updateCell({ value: 'Payment Left' }, 'H1');
        }
      })
      .catch(error => console.error('Error loading data:', error));
  };

  const saveToDatabase = () => {
    if (spreadsheetRef.current) {
      spreadsheetRef.current.saveAsJson().then(json => {
        fetch('/api/spreadsheetdata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(json.jsonObject) 
        })
        .then(response => response.json())
        .then(data => console.log('Data saved:', data))
        .catch(error => console.error('Error saving data:', error));
      });
    }
  };

  const created = () => {
    if (spreadsheetRef.current) {
      spreadsheetRef.current.cellFormat({ fontWeight: 'bold', textAlign: 'center' }, 'A1:H1');
    }
  };

  return (
    <div>
      <button className='bg-amber-700 p-2 rounded-xl text-white hover:cursor-pointer mb-4' onClick={saveToDatabase}>Save to MongoDB</button>
      <SpreadsheetComponent 
        ref={spreadsheetRef}
        created={created}
        height={600}
      >
        <SheetsDirective>
          <SheetDirective name="Sheet1">
            <RangesDirective>
              <RangeDirective dataSource={initialData} startCell="A1"></RangeDirective>
            </RangesDirective>
            <ColumnsDirective>
              <ColumnDirective width={120} />
              <ColumnDirective width={120} />
              <ColumnDirective width={120} />
              <ColumnDirective width={150} />
              <ColumnDirective width={120} />
              <ColumnDirective width={120} />
              <ColumnDirective width={120} />
              <ColumnDirective width={150} />
            </ColumnsDirective>
          </SheetDirective>
        </SheetsDirective>
      </SpreadsheetComponent>
    </div>
  );
};

export default SpreadsheetApp;