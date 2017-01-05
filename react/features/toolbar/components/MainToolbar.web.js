/* global APP, interfaceConfig */

import React from 'react';

import UIEvents from '../../../../service/UI/UIEvents';
import Toolbar from './Toolbar';

/**
 * React component representing main toolbar.
 *
 * @class MainToolbar
 */
export default class MainToolbar extends Toolbar {

    /**
     * Constructor of the class.
     *
     * @param {Object} props - React props for the component.
     */
    constructor(props) {
        super(props);

        // Setting the place of toolbar
        this._place = 'main';
    }

    /**
     * Initializes UI handlers for toolbar.
     *
     * @protected
     * @returns {void}
     */
    _initUIHandlers() {
        APP.UI.addListener(UIEvents.FULLSCREEN_TOGGLED,
            isFullScreen => {
                this._handleFullScreenToggled(isFullScreen);
            });
    }

    /**
     * Hook before the next button will be added to the toolbar.
     *
     * @param {number} index - Current toolbar position.
     * @param {Array} buttons - Array of buttons already added to the toolbar.
     * @override
     * @protected
     * @returns {void}
     */
    _buttonWillPush(index, buttons) {
        if (interfaceConfig.MAIN_TOOLBAR_SPLITTER_INDEX !== undefined
            && index
            === interfaceConfig.MAIN_TOOLBAR_SPLITTER_INDEX) {
            buttons.push(this._getSplitter());
        }
    }

    /**
     * Returns splitter for the main toolbar.
     *
     * @returns {ReactElement}
     * @private
     */
    _getSplitter() {
        return (
            <span className = 'toolbar__splitter' />
        );
    }

    /**
     * Handles full screen toggled.
     *
     * @param {boolean} isFullScreen - Indicates if we're currently in full
     * screen mode.
     * @returns {void}
     */
    _handleFullScreenToggled(isFullScreen) {
        const buttonId = 'toolbar_button_fullScreen';
        const element = document.getElementById(buttonId);

        element.className = isFullScreen
            ? element.className
            .replace('icon-full-screen', 'icon-exit-full-screen')
            : element.className
            .replace('icon-exit-full-screen', 'icon-full-screen');

        APP.UI.Toolbar._setToggledState(buttonId, isFullScreen);
    }

    /**
     * Rendering method.
     *
     * @returns {ReactElement}
     */
    render() {
        return (
            <div
                className = 'toolbar'
                id = 'mainToolbar' >
                { this._getButtons() }
            </div>
        );
    }
}
