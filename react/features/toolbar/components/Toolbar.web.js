/* global APP, interfaceConfig */
import React, { Component } from 'react';

import UIEvents from '../../../../service/UI/UIEvents';

import ToolbarButton from './ToolbarButton';
import defaultToolbarButtons from './defaultToolbarButtons';
import { getToolbarButtonPlace, getButtonHandlers } from '../functions';

/**
 * React component representing the main toolbar.
 *
 * @class Toolbar
 */
export default class Toolbar extends Component {

    /**
     * Initializes toolbar buttons and UI handlers.
     *
     * @returns {void}
     */
    componentWillMount() {
        // Initialise the toolbar buttons.
        // The main toolbar will only take into account
        // it's own configuration from interface_config.
        this._initToolbarButtons();

        APP.UI.addListener(UIEvents.FULLSCREEN_TOGGLED,
            isFullScreen => {
                APP.UI.Toolbar._handleFullScreenToggled(isFullScreen);
            });
    }

    /**
     * Initialise toolbar buttons.
     *
     * @returns {void}
     */
    _initToolbarButtons() {
        const buttons = interfaceConfig.TOOLBAR_BUTTONS
            .filter(value => value)
            .reduce((acc, value) => {
                const place = getToolbarButtonPlace(value);

                if (place === 'main' && value in defaultToolbarButtons) {
                    const button = defaultToolbarButtons[value];

                    button.name = value;
                    acc.push(button);
                }

                return acc;
            }, []);

        this.setState({ buttons });
    }

    /**
     * Returns array of buttons to be shown in the main toolbar.
     *
     * @returns {Array}
     * @private
     */
    _getButtons() {
        const { buttons } = this.state;
        const buttonHandlers = getButtonHandlers(APP.UI.eventEmitter);

        return buttons.reduce((acc, button, index) => {
            const onClick = buttonHandlers[button.id];

            if (interfaceConfig.MAIN_TOOLBAR_SPLITTER_INDEX !== undefined
                && index
                === interfaceConfig.MAIN_TOOLBAR_SPLITTER_INDEX) {
                acc.push(this._getSplitter());
            }

            acc.push(
                <ToolbarButton
                    button = { button }
                    onClick = { onClick } />
            );

            return acc;
        }, []);
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
