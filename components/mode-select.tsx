import React, {useState} from 'react';
import MatrixButtonGrid  from '../components/matrix-button-grid'
import PixelButtonGrid  from '../components/pixel-button-grid'
import {FormControl, InputLabel, MenuItem, Select, SelectChangeEvent} from "@mui/material";

const ModeSelect = () => {
    const [mode, setMode] = useState('matrix');

    const [methodName, setMethodName] = useState('');
    const [arrayName, setArrayName] = useState('');

    const [columns, setColumns] = useState<number>(0);
    const [rows, setRows] = useState<number>(0);

    return (
        <React.Fragment>
            <FormControl sx={{ m: 1, minWidth: 120 }} size="small">
                <InputLabel id="mode-select">Select Mode</InputLabel>
                <Select
                    labelId="mode-select"
                    id="mode-select"
                    value={mode}
                    label="Select Mode"
                    onChange={(event: SelectChangeEvent) => setMode(event.target.value)}
                >
                    <MenuItem value='matrix'>Matrix</MenuItem>
                    <MenuItem value='pixel'>Pixel</MenuItem>
                </Select>
            </FormControl>

            {mode === 'matrix' ? <MatrixButtonGrid
                    methodName={methodName}
                    setMethodName={setMethodName}
                    arrayName={arrayName}
                    setArrayName={setArrayName}
                    columns={columns}
                    setColumns={setColumns}
                    rows={rows}
                    setRows={setRows}
                /> :
                <PixelButtonGrid
                    methodName={methodName}
                    setMethodName={setMethodName}
                    arrayName={arrayName}
                    setArrayName={setArrayName}
                    columns={columns}
                    setColumns={setColumns}
                    rows={rows}
                    setRows={setRows}
                />}


        </React.Fragment>

    );
};

export default ModeSelect;