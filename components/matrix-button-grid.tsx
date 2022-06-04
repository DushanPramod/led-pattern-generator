import React, {useState} from 'react';
import _ from 'lodash';
import {
    ButtonGroup,
    SelectChangeEvent,
    FormControlLabel,
    TextareaAutosize,
    Switch
} from "@mui/material";

import InputField from './input-field';
import CircleIcon from '@mui/icons-material/Circle';
import IconButton from "@mui/material/IconButton";

const MatrixButtonGrid = (props: any) => {
    const {methodName, setMethodName, arrayName, setArrayName, columns, setColumns, rows, setRows} = props;
    const [isSelectedLed, setIsSelectedLed] = useState(false);

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


    function outputGenerate(statusArr: boolean[][]){
        let str = `void ${methodName}(){\n`;

        statusArr.map((row, rowIndex) => {
            row.map((cell, colIndex) => {
                if (isSelectedLed) {
                    if (cell) str += `   ${arrayName}[${rowIndex}][${colIndex}] = ${cell ? '1' : '0'}\n`
                } else {
                    str += `    ${arrayName}[${rowIndex}][${colIndex}] = ${cell ? '1' : '0'}\n`
                }
            })
        })
        str += '}'
        return str;
    }


    return (
        <React.Fragment>
            <InputField
                methodName={methodName}
                setMethodName={setMethodName}
                arrayName={arrayName}
                setArrayName={setArrayName}
                columns={columns}
                rows={rows}
                onChangeSize={onChangeSize}
            />
            <FormControlLabel
                sx={{m: 1}}
                control={<Switch checked={isSelectedLed} onChange={(event, checked) => setIsSelectedLed(checked)}/>}
                label="Only Selected LEDs"
            />
            <div>
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
            </div>

            <div>
                <TextareaAutosize
                    style={{marginTop: 5, minWidth: 300, minHeight: 400}}

                    value={outputGenerate(statusArr)}
                    readOnly={true}
                />
            </div>
        </React.Fragment>
    );
};

export default MatrixButtonGrid;