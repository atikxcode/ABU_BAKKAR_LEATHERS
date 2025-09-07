"use client";

import React from 'react';
import dynamic from 'next/dynamic';
import '@syncfusion/ej2-base/styles/material.css';
import '@syncfusion/ej2-buttons/styles/material.css';
import '@syncfusion/ej2-splitbuttons/styles/material.css';
import '@syncfusion/ej2-lists/styles/material.css';
import '@syncfusion/ej2-navigations/styles/material.css';
import '@syncfusion/ej2-popups/styles/material.css';
import '@syncfusion/ej2-dropdowns/styles/material.css';
import '@syncfusion/ej2-grids/styles/material.css';
import '@syncfusion/ej2-react-spreadsheet/styles/material.css';

const SpreadsheetComponent = dynamic(
    () => import('@syncfusion/ej2-react-spreadsheet').then((mod) => mod.SpreadsheetComponent),
    { ssr: false }
);

const ReportGenerate = () => {
    return (
        <div>
            <SpreadsheetComponent
                height="600px" // Set desired height (e.g., 600px)
                allowOpen={true}
                openUrl='https://ej2services.syncfusion.com/production/web-services/api/spreadsheet/open'
                allowSave={true}
                saveUrl='https://ej2services.syncfusion.com/production/web-services/api/spreadsheet/save'
            ></SpreadsheetComponent>
        </div>
    );
};

export default ReportGenerate;