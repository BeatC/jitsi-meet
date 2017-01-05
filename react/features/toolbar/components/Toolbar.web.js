/* global APP, interfaceConfig */
import React, { Component } from 'react';

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
     * Constructor of the toolbar class.
     *
     * @param {Object} props - React props for the component.
     */
    constructor(props) {
        super(props);

        // Main toolbar buttons by default
        this._place = 'main';
    }

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
        this._initUIHandlers();
    }

    /**
     * Initializes UI handlers for toolbar.
     *
     * @protected
     * @abstract
     * @returns {void}
     */
    _initUIHandlers() {
        // Base class doesn't have implementation of this method
    }

    /**
     * Initialise toolbar buttons.
     *
     * @returns {void}
     * @private
     */
    _initToolbarButtons() {
        const buttons = interfaceConfig.TOOLBAR_BUTTONS
            .filter(value => value)
            .reduce((acc, value) => {
                const place = getToolbarButtonPlace(value);

                if (place === this._place && value in defaultToolbarButtons) {
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
     * @protected
     */
    _getButtons() {
        const { buttons } = this.state;
        const buttonHandlers = getButtonHandlers(APP.UI.eventEmitter);

        return buttons.reduce((acc, button, index) => {
            const onClick = buttonHandlers[button.id];

            this._buttonWillPush(index, acc);

            acc.push(
                <ToolbarButton
                    button = { button }
                    key = { button.id }
                    onClick = { onClick } />
            );

            return acc;
        }, []);
    }

    /**
     * Hook before the next button will be added to the toolbar.
     *
     * @param {number} index - Current toolbar position.
     * @param {Array} buttons - Array of buttons already added to the toolbar.
     * @protected
     * @abstract
     * @returns {void}
     */
    _buttonWillPush() {
        // Base class doesn't have implementation of this method.
    }
}
