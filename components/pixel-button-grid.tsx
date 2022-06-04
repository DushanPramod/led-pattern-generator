import React, {useState} from 'react';
import {ButtonGroup, FormControlLabel, SelectChangeEvent, Switch, TextareaAutosize} from "@mui/material";
import IconButton from "@mui/material/IconButton";
import CircleIcon from "@mui/icons-material/Circle";
import _ from "lodash";
import InputField from "./input-field";

import {HexColorPicker} from "react-colorful";

const PixelButtonGrid = (props: any) => {
    const {methodName, setMethodName, arrayName, setArrayName, columns, setColumns, rows, setRows} = props;


    const [isOnlyColoredLed, setIsOnlyColoredLed] = useState<boolean>(false);
    const [color, setColor] = useState<string>("#000000");


    const [statusArr, setStatusArr] = useState<string[][]>(Array.from(Array(rows)).map(r => Array.from(Array(columns)).map(c => '#000000')));

    const onButtonClick = (row: number, column: number, color: string) => {
        if (statusArr[row][column] !== color) {
            const arr = _.clone(statusArr);
            arr[row][column] = color;
            setStatusArr(arr)
        }
    }

    const onChangeSize = (field: string, event: SelectChangeEvent) => {
        const value = Number(event.target.value);

        if (field === 'row' && rows !== value) {
            setRows(value)
            setStatusArr(Array.from(Array(value)).map(r => Array.from(Array(columns)).map(c => '#000000')))
        } else if (field === 'column' && columns !== value) {
            setColumns(value);
            setStatusArr(Array.from(Array(rows)).map(r => Array.from(Array(value)).map(c => '#000000')))
        }
    }

    function outputGenerate(statusArr: string[][]){
        let str = `void ${methodName}(){\n`;

        statusArr.map((row, rowIndex) => {
            row.map((cell, colIndex) => {
                if (isOnlyColoredLed) {
                    if (cell !== '#000000') {
                        str += `   ${arrayName}[${rowIndex}][${colIndex}][0] = ${parseInt(cell.substring(1,3), 16)}\n`;
                        str += `   ${arrayName}[${rowIndex}][${colIndex}][1] = ${parseInt(cell.substring(3, 5), 16)}\n`;
                        str += `   ${arrayName}[${rowIndex}][${colIndex}][2] = ${parseInt(cell.substring(5, 7), 16)}\n`
                    }
                } else {
                    str += `   ${arrayName}[${rowIndex}][${colIndex}][0] = ${parseInt(cell.substring(1,3), 16)}\n`;
                    str += `   ${arrayName}[${rowIndex}][${colIndex}][1] = ${parseInt(cell.substring(3, 5), 16)}\n`;
                    str += `   ${arrayName}[${rowIndex}][${colIndex}][2] = ${parseInt(cell.substring(5, 7), 16)}\n`
                }
            })
        })
        str += '}'
        return str
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
                control={<Switch checked={isOnlyColoredLed}
                                 onChange={(event, checked) => setIsOnlyColoredLed(checked)}/>}
                label="Only Colored LEDs"
            />
            <HexColorPicker color={color} onChange={setColor}/>
            <div>
                <ButtonGroup sx={{mt: 2}} orientation="vertical">
                    {statusArr.map((row, rowIndex) => (
                        <ButtonGroup key={rowIndex} orientation="horizontal">
                            {row.map((cell, colIndex) => (
                                <IconButton onClick={() => onButtonClick(rowIndex, colIndex, color)} size='small'
                                            key={colIndex}>
                                    <CircleIcon style={{color: cell}}/>
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

export default PixelButtonGrid;