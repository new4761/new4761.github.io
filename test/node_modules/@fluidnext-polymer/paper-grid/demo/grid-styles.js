import { html } from '@polymer/polymer/polymer-element.js';

export const gridStyles = html`
<style>
    paper-grid tile {
        background: tomato;
        opacity: 0.8;
        color: white;
        cursor: move;
        overflow: hidden;
        display: flex;
        justify-content: center;
        align-items: center;
    }

    paper-grid [placeholder] {
        background: #afafaf;
    }

    paper-grid tile>span:not([resize]) {
        flex: 1;
        text-align: center;
        font-size: 2em;
    }

    paper-grid [resize] {
        position: absolute;
    }

    paper-grid [resize="bottom-right"] {
        bottom: 0;
        right: 0;
        cursor: nwse-resize;
    }

    paper-grid [resize="bottom-left"] {
        bottom: 0;
        left: 0;
        cursor: nesw-resize;
    }

    paper-grid [resize="top-right"] {
        top: 0;
        right: 0;
        cursor: nesw-resize;
    }

    paper-grid [resize="top-left"] {
        top: 0;
        left: 0;
        cursor: nwse-resize;
    }

    paper-grid [resize="left"] {
        top: 50%;
        left: 0;
        cursor: ew-resize;
        margin-top: -10px;
    }

    paper-grid [resize="top"] {
        top: 0%;
        width: 100%;
        text-align: center;
        cursor: ns-resize;
    }

    paper-grid [resize="right"] {
        top: 50%;
        right: 0;
        cursor: ew-resize;
        margin-top: -10px;
    }

    paper-grid [resize="bottom"] {
        bottom: 0;
        width: 100%;
        text-align: center;
        cursor: ns-resize;
    }

    dom-repeat {
        display: none;
    }
</style>
    `;
