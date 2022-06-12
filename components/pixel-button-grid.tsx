import React, {useEffect, useRef, useState} from 'react';
import {
    Button,
    FormControlLabel,
    SelectChangeEvent,
    Slider,
    Switch,
    TextField
} from "@mui/material";
import ColorPicker from './color-picker'
import _ from "lodash";
import {CONFIG} from "../config/config";
import CanvasDraw from '../components/react-canvas-draw/index';
import { minDistance, getCellCordinatesByCell, getGridLines } from '../utils/utils'

const PixelButtonGrid = () => {
    const [methodName, setMethodName] = useState('');
    const [arrayName, setArrayName] = useState('');
    const [columns, setColumns] = useState<number>(CONFIG.PIXEL_MIN_COLUMN_LENGTH);
    const [rows, setRows] = useState<number>(CONFIG.PIXEL_MIN_ROW_LENGTH);

    let saveableCanvas = useRef<any>();
    const [gridSize, setGridSize] = useState<number>(CONFIG.PIXEL_GRID_SIZE);
    const [brushRadius, setBrushRadius] = useState<number>(CONFIG.PIXEL_BRUSH_RADIUS);


    const [isOnlyColoredLed, setIsOnlyColoredLed] = useState<boolean>(false);
    const [selectedColor, setSelectedColor] = useState<string>('#0000ff')


    const [statusArr, setStatusArr] = useState<{x:number, y:number, color:string}[][]>(Array.from(Array(rows))
        .map((row, rowIndex) => Array.from(Array(columns))
            .map((column, colIndex) => ({...getCellCordinatesByCell(rowIndex, colIndex, gridSize),color:'#0000ff'}))));

    const [outputStr, setOutputStr] = useState<string>('');


    //output generate
    useEffect(()=>{
        setOutputStr(outputGenerate(statusArr))
    }, [columns, rows, methodName, arrayName, isOnlyColoredLed, statusArr]);

    //canvas display
    useEffect(()=> {
        if(rows > 0 && columns> 0) {
            // @ts-ignore
            saveableCanvas.loadSaveData(getCanvasDisplay(statusArr, gridSize), true);
        }
    }, [rows, columns, gridSize, statusArr])


    useEffect(()=>{
        const newArray = statusArr.map((row, rowIndex) => row
            .map((column, colIndex) => ({...column, ...getCellCordinatesByCell(rowIndex, colIndex, gridSize)})))

        setStatusArr(newArray);
    }, [gridSize])


    useEffect(() => {

        const oldRowCount = statusArr.length;
        const oldColCount = statusArr.length ? statusArr[0].length : 0;

        const getCelColor = (rowIndex: number, colIndex: number): string => {
            if (rowIndex < oldRowCount && colIndex < oldColCount) {
                return statusArr[rowIndex][colIndex].color;
            } else {
                return '#000000'
            }
        }

        const newArray = Array.from(Array(rows))
            .map((row, rowIndex) => Array.from(Array(columns))
                .map((column, colIndex) => ({
                    ...getCellCordinatesByCell(rowIndex, colIndex, gridSize),
                    color: getCelColor(rowIndex, colIndex)
                })));

        setStatusArr(newArray)
    }, [rows, columns])



    const onChangeSize = (field: string, event: any) => {
        const value = Number(event.target.value);

        if (field === 'row' && rows !== value) {
            setRows(value)
        } else if (field === 'column' && columns !== value) {
            setColumns(value);
        }
    }

    const onClickClear = () => {
        const arr = statusArr.map((row) => row.map(cell => ({...cell, color:'#000000'})))
        setStatusArr(arr);
    }


    function outputGenerate(statusArr: {x:number, y:number, color:string}[][]){
        let str = `void ${methodName}(){\n`;

        statusArr.map((row, rowIndex) => {
            row.map((cell, colIndex) => {
                if (isOnlyColoredLed) {
                    if (cell.color !== '#000000') {
                        str += `   ${arrayName}[${rowIndex}][${colIndex}][0] = ${parseInt(cell.color.substring(1,3), 16)};\n`;
                        str += `   ${arrayName}[${rowIndex}][${colIndex}][1] = ${parseInt(cell.color.substring(3, 5), 16)};\n`;
                        str += `   ${arrayName}[${rowIndex}][${colIndex}][2] = ${parseInt(cell.color.substring(5, 7), 16)};\n`
                    }
                } else {
                    str += `   ${arrayName}[${rowIndex}][${colIndex}][0] = ${parseInt(cell.color.substring(1,3), 16)};\n`;
                    str += `   ${arrayName}[${rowIndex}][${colIndex}][1] = ${parseInt(cell.color.substring(3, 5), 16)};\n`;
                    str += `   ${arrayName}[${rowIndex}][${colIndex}][2] = ${parseInt(cell.color.substring(5, 7), 16)};\n`
                }
            })
        })
        str += '}'
        return str
    }

    const getCanvasDisplay = (arr:{x:number, y:number, color:string}[][], gridSize:number):string => {
        return JSON.stringify({
            height:rows * gridSize,
            width:columns * gridSize,
            lines: [
                {
                    brushColor:CONFIG.PIXEL_CANVAS_BACKGROUND_COLOR,
                    brushRadius: gridSize * rows/2,
                    points:[{x:0, y:gridSize * rows/2}, {x:gridSize*columns, y:gridSize * rows/2}]
                },
                ...getGridLines(rows, columns, gridSize, '#ffffff'),
                ..._.compact(_.flatten(arr).map(cell => {
                    if(cell.color !== '#000000') return {brushColor: cell.color, brushRadius:((gridSize/2)*0.8), points:[{x:cell.x, y:cell.y}, {x:cell.x, y:cell.y}]}
                }))
            ]
        })
    };

    const onChangeCanvas = (event: any) => {
        const data = JSON.parse(event.getSaveData());
        const {brushColor, brushRadius, points } = data.lines[data.lines.length - 1];

        if(brushRadius === 1 || (brushColor === CONFIG.PIXEL_CANVAS_BACKGROUND_COLOR && brushRadius === gridSize*rows/2)) return;

        if(points.length===2 && points[0].x === points[1].x && points[0].y === points[1].y && _.flatten(statusArr).some(e => e.x === points[0].x && e.y === points[0].y)) return;


        const cloneStatusArr = [...statusArr];
        for (let i = 0; i < points.length - 1; i++) {
            statusArr.forEach((row, rowIndex) => {
                row.forEach((cell, colIndex )=> {
                    const {x ,y} = cell;
                    const {x:x1, y:y1} = points[i];
                    const {x:x2, y:y2} = points[i + 1];

                    if(brushRadius >= minDistance([x1, y1], [x2, y2], [x, y])){
                        cloneStatusArr[rowIndex][colIndex] = {...cloneStatusArr[rowIndex][colIndex], color:selectedColor}
                    }
                })
            })
        }
        setStatusArr(cloneStatusArr);
    }


    return (
        <React.Fragment>
            <div>
                <TextField
                    sx={{m: 1, width: 100}}
                    id="row-input"
                    label="Rows"
                    variant="outlined"
                    size="small"
                    type='number'
                    inputProps={{ min: CONFIG.PIXEL_MIN_ROW_LENGTH, max: CONFIG.PIXEL_MAX_ROW_LENGTH }}
                    value={rows.toString()}
                    onChange={(event) => onChangeSize('row', event)}
                />
                <TextField
                    sx={{m: 1, width: 100}}
                    id="columns-input"
                    label="Columns"
                    variant="outlined"
                    size="small"
                    type='number'
                    inputProps={{ min: CONFIG.PIXEL_MIN_COLUMN_LENGTH, max: CONFIG.PIXEL_MAX_COLUMN_LENGTH }}
                    value={columns.toString()}
                    onChange={(event) => onChangeSize('column', event)}
                />
                <TextField
                    sx={{m: 1, minWidth: 100}}
                    size="small"
                    label="Method Name"
                    id="outlined-size-small"
                    value={methodName}
                    onChange={(event) => setMethodName(event.target.value)}
                />
                <TextField
                    sx={{m: 1, minWidth: 100}}
                    size="small"
                    label="Array Name"
                    id="outlined-size-small"
                    value={arrayName}
                    onChange={(event) => setArrayName(event.target.value)}
                />
                <Button sx={{m: 1}} variant="contained" color='error' onClick={()=>onClickClear()}>Clear</Button>

                <FormControlLabel
                    sx={{m: 1}}
                    control={<Switch checked={isOnlyColoredLed}
                                     onChange={(event, checked) => setIsOnlyColoredLed(checked)}/>}
                    label="Only Colored LEDs"
                />
                <div >
                    <span style={{display:'flex', flexDirection:'row'}}>
                        <span>Grid Size </span>
                        <Slider
                            style={{maxWidth:300, marginLeft:10}}
                            value={gridSize}
                            valueLabelDisplay="auto"
                            onChange={(event:Event, value:number|number[]) => setGridSize(value as number)}
                            aria-label="Temperature"
                            step={5}
                            marks
                            min={5}
                            max={100}
                        />
                    </span>
                    <span style={{display:'flex', flexDirection:'row'}}>
                        <span>Brush Radius</span>
                        <Slider
                            style={{maxWidth:300, marginLeft:10}}
                            value={brushRadius}
                            valueLabelDisplay="auto"
                            onChange={(event:Event, value:number|number[]) => setBrushRadius(value as number)}
                            aria-label="Temperature"
                            step={5}
                            marks
                            min={5}
                            max={100}
                        />
                    </span>
                </div>
            </div>
            <ColorPicker
                color={selectedColor}
                onColorChange={(color: React.SetStateAction<string>) => setSelectedColor(color)}
            />
            <div style={{marginTop:20}}>
                {(rows>0 && columns>0) ? <CanvasDraw
                    ref={(canvasDraw: any) => (saveableCanvas = canvasDraw)}
                    lazyRadius={0}
                    brushRadius={brushRadius}
                    gridSizeX={gridSize}
                    gridSizeY={gridSize}
                    gridLineWidth={0.5}
                    canvasWidth={gridSize * columns}
                    canvasHeight={gridSize * rows}
                    gridColor={"rgb(0,0,0)"}
                    brushColor={selectedColor}
                    catenaryColor={"#ffffff"}
                    onChange={(event: any) => onChangeCanvas(event)}
                    hideInterface={false}
                    loadTimeOffset={5}
                    hideGrid={true}
                    immediateLoading={true}
                /> : ''}
            </div>
            <div>
                <TextField
                    sx={{marginTop:3, minWidth:300, minHeight:400}}
                    label="Output"
                    multiline
                    maxRows={20}
                    aria-readonly={true}
                    value={outputStr}
                />
            </div>
        </React.Fragment>
    );
};

export default PixelButtonGrid;