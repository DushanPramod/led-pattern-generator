import React, {useState,useRef, useEffect, useCallback} from 'react';
import _, {throttle} from 'lodash';
import {
    ButtonGroup,
    SelectChangeEvent,
    FormControlLabel,
    TextareaAutosize,
    Switch,
    TextField,
    Button,
    Box,
    Slider
} from "@mui/material";
import RectangleIcon from '@mui/icons-material/Rectangle';
import IconButton from "@mui/material/IconButton";
import { minDistance, getCellCordinatesByCell, getGridLines } from '../utils/utils'
import CanvasDraw from './react-canvas-draw';
import {CONFIG} from "../config/config";



const MatrixButtonGrid = () => {
    const [methodName, setMethodName] = useState('');
    const [arrayName, setArrayName] = useState('');
    const [columns, setColumns] = useState<number>(CONFIG.MATRIX_MIN_COLUMN_LENGTH);
    const [rows, setRows] = useState<number>(CONFIG.MATRIX_MIN_ROW_LENGTH);

    let saveableCanvas = useRef<any>();
    const [gridSize, setGridSize] = useState<number>(CONFIG.MATRIX_GRID_SIZE);
    const [brushRadius, setBrushRadius] = useState<number>(CONFIG.MATRIX_BRUSH_RADIUS);

    const [isSelectedLed, setIsSelectedLed] = useState(false);
    const [selectedColor, setSelectedColor] = useState<string>('#ff0000')

    const [statusArr, setStatusArr] = useState<{x:number, y: number, status:boolean}[][]>(
        Array.from(Array(rows))
            .map((row, rowIndex) => Array.from(Array(columns))
                .map((column, colIndex) => ({...getCellCordinatesByCell(rowIndex, colIndex, gridSize),status:false}))));

    const [outputStr, setOutputStr] = useState<string>('');

    //output generate
    useEffect(()=>{
        setOutputStr(outputGenerate(statusArr))
    }, [columns, rows, methodName, arrayName, isSelectedLed, statusArr]);

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

        const getCelStatus = (rowIndex: number, colIndex: number): boolean => {
            if (rowIndex < oldRowCount && colIndex < oldColCount) {
                return statusArr[rowIndex][colIndex].status;
            } else {
                return false
            }
        }

        const newArray = Array.from(Array(rows))
            .map((row, rowIndex) => Array.from(Array(columns))
                .map((column, colIndex) => ({
                    ...getCellCordinatesByCell(rowIndex, colIndex, gridSize),
                    status: getCelStatus(rowIndex, colIndex)
                })));

        setStatusArr(newArray)
    }, [rows, columns])


    const onChangeSize = (field: string, event:any) => {
        const value = Number(event.target.value);

        if (field === 'row' && rows !== value) {
            setRows(value)

        } else if (field === 'column' && columns !== value) {
            setColumns(value);
        }
    }


    const outputGenerate = (statusArr: {x:number, y: number, status:boolean}[][]) => {
        let str = `void ${methodName}(){\n`;

        statusArr.map((row, rowIndex) => {
            row.map((cell, colIndex) => {
                if (isSelectedLed) {
                    if (cell.status) str += `   ${arrayName}[${rowIndex}][${colIndex}] = ${cell.status ? '1' : '0'};\n`
                } else {
                    str += `    ${arrayName}[${rowIndex}][${colIndex}] = ${cell.status ? '1' : '0'};\n`
                }
            })
        })
        str += '}'
        return str;
    }

    const getCanvasDisplay = (arr:{x:number, y:number, status:boolean}[][], gridSize:number):string => {
        return JSON.stringify({
            height:rows * gridSize,
            width:columns * gridSize,
            lines: [
                ...getGridLines(rows, columns, gridSize, '#000000'),
                ..._.compact(_.flatten(arr).map(cell => {
                if(cell.status) return {brushColor: cell.status? '#ff0000' : '#4b4a4a', brushRadius:((gridSize/2)*0.8), points:[{x:cell.x, y:cell.y}, {x:cell.x, y:cell.y}]}
            }))
            ]
        })
    };

    const onClickClear = () => {
        const arr = statusArr.map((row) => row.map(cell => ({...cell, status:false})))
        setStatusArr(arr);
    }


    const onChangeCanvas = (event: any) => {
        const data = JSON.parse(event.getSaveData());
        const {brushColor, brushRadius, points } = data.lines[data.lines.length - 1];

        if(brushRadius === 1) return;

        if(points.length===2 && points[0].x === points[1].x && points[0].y === points[1].y && _.flatten(statusArr).some(e => e.x === points[0].x && e.y === points[0].y)) return;


        const cloneStatusArr = [...statusArr];
        for (let i = 0; i < points.length - 1; i++) {
            statusArr.forEach((row, rowIndex) => {
                row.forEach((cell, colIndex )=> {
                    const {x ,y} = cell;
                    const {x:x1, y:y1} = points[i];
                    const {x:x2, y:y2} = points[i + 1];

                    if(brushRadius >= minDistance([x1, y1], [x2, y2], [x, y])){
                        if(selectedColor === '#ff0000'){
                            cloneStatusArr[rowIndex][colIndex] = {...cloneStatusArr[rowIndex][colIndex], status:true}
                        }
                        else {
                            cloneStatusArr[rowIndex][colIndex] = {...cloneStatusArr[rowIndex][colIndex], status:false}
                        }

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
                    inputProps={{ min: CONFIG.MATRIX_MIN_ROW_LENGTH, max: CONFIG.MATRIX_MAX_ROW_LENGTH }}
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
                    inputProps={{ min: CONFIG.MATRIX_MIN_COLUMN_LENGTH, max: CONFIG.MATRIX_MAX_COLUMN_LENGTH }}
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

                <IconButton disabled={selectedColor === '#ff0000'} onClick={()=>setSelectedColor('#ff0000')}>
                    <RectangleIcon style={{color: '#ff0000'}} fontSize='large'/>
                </IconButton>
                <IconButton disabled={selectedColor === '#000000'}  onClick={()=>setSelectedColor('#000000')}>
                    <RectangleIcon style={{color: '#000000'}} fontSize='large'/>
                </IconButton>

                <FormControlLabel
                    sx={{m: 1}}
                    control={
                    <Switch
                        checked={isSelectedLed}
                        onChange={(event, checked) => setIsSelectedLed(checked)}
                    />}
                    label="Only Selected LEDs"
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
                            onChange={(event:Event, value:number | number[]) => setBrushRadius(value as number)}
                            aria-label="Temperature"
                            step={5}
                            marks
                            min={5}
                            max={100}
                        />
                    </span>
                </div>
            </div>

            <div>
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

export default MatrixButtonGrid;