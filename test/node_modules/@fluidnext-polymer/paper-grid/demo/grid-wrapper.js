import { html, PolymerElement } from '@polymer/polymer/polymer-element.js';
import '@polymer/paper-input/paper-input';
import '@polymer/polymer/lib/elements/dom-repeat.js';
import '../paper-grid.js';
import '../debug-grid.js';
import { gridStyles } from './grid-styles.js';

class GridWrapper extends PolymerElement {
    static get template() {
        return html`
            <style>
                :host {
                    display: block;
                }
                #container{
                    display: block;
                }
                #containerInput{
                    display: flex;
                    justify-content: space-between;
                    width: 70%;
                    padding: 10px;
                    margin: 20px;
                    border: 1px solid #000;
                }
            </style>
            ${gridStyles}
            <div id="containerInput">
                <paper-input label="Cell Height" value="{{cellHeight}}" type="number" required></paper-input>
                <paper-input label="Cell Width" value="{{cellWidth}}" type="number" required></paper-input>
                <paper-input label="Col Count" value="{{colCount}}" type="number" required></paper-input>
                <paper-input label="Row Count" value="{{rowCount}}" type="number" required></paper-input>
                <paper-input label="Cell Margin" value="{{cellMargin}}" type="number" required></paper-input>
            </div>
            <div id="container">
                <debug-grid 
                    cell-height="{{computeCellHeight}}" 
                    cell-width="{{computeCellWidth}}" 
                    cell-margin="{{computeCellMargin}}" 
                    col-count="{{computeColCount}}" 
                    row-count="{{computeRowCount}}">
                </debug-grid>
                <paper-grid 
                    cell-height="{{computeCellHeight}}" 
                    cell-width="{{computeCellWidth}}" 
                    cell-margin="{{computeCellMargin}}" 
                    col-count="{{computeColCount}}" 
                    row-count="{{computeRowCount}}" 
                    overlappable 
                    col-autogrow 
                    row-autogrow 
                    draggable 
                    resizable 
                    animated>
                    <dom-repeat items="{{boxes}}">
                        <template>
                            <tile col$="{{item.col}}" row$="{{item.row}}" height$="{{item.height}}" width$="{{item.width}}">
                                <span>{{item.title}}</span>
                                <span resize="left">│</span>
                                <span resize="right">│</span>
                                <span resize="top">─</span>
                                <span resize="bottom">─</span>
                                <span resize="top-right">┐</span>
                                <span resize="top-left">┌</span>
                                <span resize="bottom-right">┘</span>
                                <span resize="bottom-left">└</span>
                            </tile>
                        </template>
                    </dom-repeat>
                    <div placeholder></div>
                </paper-grid>
            </div>
        `
    }

    static get properties() {
        return {
            boxes: {
                type: Array,
                value: function () {
                    return [
                        { title: '0', col: 0, row: 0, width: 1, height: 1 },
                        { title: '1', col: 2, row: 0, width: 1, height: 1 },
                        { title: '2', col: 2, row: 2, width: 1, height: 4 },
                        { title: '3', col: 3, row: 2, width: 1, height: 1 },
                        { title: '4', col: 5, row: 1, width: 2, height: 2 },
                        { title: '5', col: 0, row: 1, width: 2, height: 2 },
                        { title: '6', col: 0, row: 3, width: 1, height: 1 },
                        { title: '7', col: 0, row: 5, width: 2, height: 2 },
                        { title: '8', col: 5, row: 4, width: 1, height: 1 },
                    ];
                }
            },
            cellWidth: {
                type: Number,
                value: 100,
                observer: '_observerCellWidth'
            },
            cellHeight: {
                type: Number,
                value: 100,
                observer: '_observerCellHeight'
            },
            cellMargin: {
                type: Number,
                value: 10,
                observer: '_observerCellMargin'
            },
            rowCount: {
                type: Number,
                observer: '_observerRowCount',
                value: 10
            },
            colCount: {
                type: Number,
                observer: '_observerColCount',
                value: 17
            },
            computeCellWidth: {
                type: Number,
                notify: true,
                value: 100
            },
            computeCellHeight: {
                type: Number,
                notify: true,
                value: 100
            },
            computeCellMargin: {
                type: Number,
                notify: true,
                value: 10
            },
            computeRowCount: {
                type: Number,
                notify: true,
                value: 10
            },
            computeColCount: {
                type: Number,
                notify: true,
                value: 17
            }
        }
    }

    constructor() {
        super();
    }

    /**
     * @param newValue
     * @private
     */
    _observerCellWidth(newValue){
        if (!newValue) {
            return;
        }

        this.computeCellWidth = typeof newValue === 'string' ? parseInt(newValue) : newValue;
    }

    /**
     * @param newValue
     * @private
     */
    _observerCellHeight(newValue){
        if (!newValue) {
            return;
        }

        this.computeCellHeight = typeof newValue === 'string' ? parseInt(newValue) : newValue;
    }

    /**
     * @param newValue
     * @private
     */
    _observerCellMargin(newValue){
        if (!newValue) {
            return;
        }

        this.computeCellMargin = typeof newValue === 'string' ? parseInt(newValue) : newValue;
    }

    /**
     * @param newValue
     * @private
     */
    _observerRowCount(newValue){
        if (!newValue) {
            return;
        }

        this.computeRowCount = typeof newValue === 'string' ? parseInt(newValue) : newValue;
    }

    /**
     * @param newValue
     * @private
     */
    _observerColCount(newValue){
        if (!newValue) {
            return;
        }

        this.computeColCount = typeof newValue === 'string' ? parseInt(newValue) : newValue;
    }
}

window.customElements.define('grid-wrapper', GridWrapper);
