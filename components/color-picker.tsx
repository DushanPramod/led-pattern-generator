import React, {useState} from 'react';
import {
    SketchPicker,
    PhotoshopPicker,
    AlphaPicker,
    BlockPicker ,
    ChromePicker,
    CirclePicker ,
    CompactPicker,
    GithubPicker ,
    HuePicker,
    SliderPicker,
    SwatchesPicker,
    TwitterPicker  } from 'react-color';
import rgbHex from 'rgb-hex';
import hexRgb from 'hex-rgb';

const ColorPicker = (props:any) => {
    const {color, onColorChange} = props;

    const [selectedColor, setColor] = useState<any>({
        r:hexRgb(color).red,
        g:hexRgb(color).green,
        b:hexRgb(color).blue,
    });

    const handleChangeComplete = () => {
        onColorChange(`#${rgbHex(selectedColor.r, selectedColor.g, selectedColor.b)}`)
    };


    return (
        <div>
            <SketchPicker
                width={250}
                disableAlpha={true}
                color={selectedColor}
                onChange={(c) => setColor(c.rgb)}
                onChangeComplete={handleChangeComplete}
            />
        </div>
    );
};

export default ColorPicker;
