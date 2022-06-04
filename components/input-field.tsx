import React from 'react';
import {FormControl, InputLabel, MenuItem, Select, SelectChangeEvent, TextField} from "@mui/material";

const InputField = (props:any) => {
    const {methodName, setMethodName, arrayName, setArrayName, columns, rows, onChangeSize } = props;

    return (
        <React.Fragment>
            <FormControl sx={{m: 1, minWidth: 100}} size="small">
                <InputLabel id="row-input">Rows</InputLabel>
                <Select
                    labelId="row-input"
                    id="row-input"
                    label="Rows"
                    value={rows.toString()}
                    defaultValue={String(0)}
                    onChange={(event: SelectChangeEvent) => onChangeSize('row', event)}
                >
                    {Array.from(Array(101)).map((e, index) => (
                        <MenuItem key={index} value={index}>{index}</MenuItem>))}
                </Select>
            </FormControl>
            <FormControl sx={{m: 1, minWidth: 100}} size="small">
                <InputLabel id="columns-input">Columns</InputLabel>
                <Select
                    labelId="columns-input"
                    id="xolumns-input"
                    label="Columns"
                    value={columns.toString()}
                    defaultValue={String(0)}
                    onChange={(event: SelectChangeEvent) => onChangeSize('column', event)}
                >
                    {Array.from(Array(101)).map((e, index) => (
                        <MenuItem key={index} value={index}>{index}</MenuItem>))}
                </Select>
            </FormControl>
            <TextField
                sx={{m: 1, minWidth: 100}}
                size="small"
                label="Method Name"
                id="outlined-size-small"
                value={methodName}
                defaultValue=""
                onChange={(event) => setMethodName(event.target.value)}
            />
            <TextField
                sx={{m: 1, minWidth: 100}}
                size="small"
                label="Array Name"
                id="outlined-size-small"
                value={arrayName}
                defaultValue=""
                onChange={(event) => setArrayName(event.target.value)}
            />
        </React.Fragment>
    );
};

export default InputField;