import React, {useState} from 'react';
import _ from 'lodash';
import {
    Button,
    ButtonGroup,
    Container,
    CssBaseline,
    ToggleButtonGroup,
    ToggleButton,
    TextField,
    Input,
    FormControl,
    FormGroup,
    InputLabel,
    Select,
    MenuItem,
    SelectChangeEvent,
    FormControlLabel,
    TextareaAutosize,
    Switch
} from "@mui/material";


import CircleIcon from '@mui/icons-material/Circle';
import IconButton from "@mui/material/IconButton";

const ButtonGrid = () => {
    const [checked, setChecked] = useState(false);
    const [methodName, setMethodName] = useState('');
    const [arrayName, setArrayName] = useState('');

    const [columns, setColumns] = useState<number>(0);
    const [rows, setRows] = useState<number>(0);

    const [statusArr, setStatusArr] = useState<boolean[][]>(Array.from(Array(rows)).map(r => Array.from(Array(columns)).map(c => false)))

    const onButtonClick = (row: number, column: number) => {
        const arr = _.clone(statusArr);
        arr[row][column] = !arr[row][column];
        setStatusArr(arr)
    }

    const onChangeSize = (field: string, event: SelectChangeEvent) => {
        const value = Number(event.target.value);

        if (field === 'row' && rows !== value) {
            setRows(value)
            setStatusArr(Array.from(Array(value)).map(r => Array.from(Array(columns)).map(c => false)))
        } else if (field === 'column' && columns !== value) {
            setColumns(value);
            setStatusArr(Array.from(Array(rows)).map(r => Array.from(Array(value)).map(c => false)))
        }
    }

    const outputGenerate = (statusArr:boolean[][]) => {
        let str = `void ${methodName}(){\n`;

        statusArr.map((row, rowIndex) => {
            row.map((cell, colIndex) => {
                if(checked){
                    if(cell) str += `   ${arrayName}[${rowIndex}][${colIndex}] = ${cell? '1' : '0'}\n`
                }
                else{
                    str += `    ${arrayName}[${rowIndex}][${colIndex}] = ${cell? '1' : '0'}\n`
                }
            })
        })
        str+='}'
        return str;
    }


    return (
        <React.Fragment>
                <div>
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
                    <FormControlLabel sx={{m:1}} control={<Switch checked={checked} onChange={(event, checked)=>setChecked(checked)}  />} label="Only Selected LEDs" />
                </div>
                <ButtonGroup orientation="vertical">
                    {statusArr.map((row, rowIndex) => (
                        <ButtonGroup key={rowIndex} orientation="horizontal">
                            {row.map((cell, colIndex) => (
                                <IconButton onClick={() => onButtonClick(rowIndex, colIndex)} size='small'
                                            key={colIndex}>
                                    <CircleIcon style={{color: cell ? '#f50000' : '#424242'}}/>
                                </IconButton>
                            ))}
                        </ButtonGroup>
                    ))}
                </ButtonGroup>
                <div>
                    <TextareaAutosize
                        style={{ marginTop:5, minWidth: 300 , minHeight:400 }}

                        value={outputGenerate(statusArr)}
                        readOnly={true}
                    />
                </div>
        </React.Fragment>
    );
};

export default ButtonGrid;