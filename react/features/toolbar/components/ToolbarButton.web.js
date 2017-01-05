/* global APP, interfaceConfig */
import React, { Component } from 'react';

import UIUtil from '../../../../modules/UI/util/UIUtil';

/**
 *  Represents a button in Toolbar.
 *
 *  @class ToolbarButton
 */
export default class ToolbarButton extends Component {

    /**
     * Constructor of Toolbar button component.
     *
     * @param {Object} props - React component props.
     */
    constructor(props) {
        super(props);

        // By default toolbar buttons don't have extra html.
        this._extraHtml = null;

        // Bind methods to save context
        this._buttonRef = this._buttonRef.bind(this);
    }

    static propTypes = {
        button: React.PropTypes.object.isRequired,
        onClick: React.PropTypes.func
    };

    /**
     * Inits the toolbar button state before it's rendered.
     *
     * @inheritdoc
     * @returns {void}
     */
    componentWillMount() {
        const { button } = this.props;
        const state = {};

        if (button.className) {
            state.className = button.className;
        }

        state.id = button.id;

        // If the button has custom inner html then
        // storing it in instance field
        if (button.html) {
            this._extraHtml = button.html;
        }

        // TODO: remove it after UI.updateDTMFSupport fix
        if (button.hidden) {
            state.style = { display: 'none' };
        }

        if (button.shortcutAttr) {
            state.shortcut = button.shortcutAttr;
        }

        if (button.content) {
            state.content = button.content;
        }

        if (button.i18n) {
            state['data-i18n'] = button.i18n;
        }

        state['data-container'] = 'body';
        state['data-placement'] = 'bottom';

        this.setState(state);
    }

    /**
     * Sets the tooltips and shortcuts after component
     * have been mounted.
     *
     * @returns {void}
     */
    componentDidMount() {
        this._setShortcutAndTooltip();
    }

    /**
     * Adds optional popups to the toolbar button.
     *
     * @param {Array} popups - The list of popups.
     * @returns {Array}
     * @private
     */
    _addPopups(popups = []) {
        return popups.map(popup =>
            <ul
                className = { popup.className }
                id = { popup.id }
                key = { popup }>
                <li data-i18n = { popup.dataAttr } />
            </ul>
        );
    }

    /**
     * Sets Shortcuts and Tooltips for all toolbar buttons.
     *
     * @private
     * @returns {void}
     */
    _setShortcutAndTooltip() {
        const { button } = this.props;
        const { buttonElement } = this;
        const { name } = button;

        if (UIUtil.isButtonEnabled(name)) {
            const isInMainToolbar = interfaceConfig.MAIN_TOOLBAR_BUTTONS
                .indexOf(name) > -1;
            const tooltipPosition = isInMainToolbar ? 'bottom' : 'right';

            UIUtil.setTooltip(buttonElement,
                button.tooltipKey,
                tooltipPosition);

            if (button.shortcut) {
                APP.keyboardshortcut.registerShortcut(
                    button.shortcut,
                    button.shortcutAttr,
                    button.shortcutFunc,
                    button.shortcutDescription
                );
            }
        }
    }

    /**
     * Renders toolbar button component.
     *
     * @inheritdoc
     * @returns {ReactElement}
     */
    render() {
        const {
            button,
            onClick
        } = this.props;

        return (
            <a
                { ...this.state }
                onClick = { onClick }
                ref = { this._buttonRef }>
                { this._extraHtml }
                { this._addPopups(button.popups) }
            </a>
        );
    }

    /**
     * Method referencing button to the instance property.
     *
     * @param {HTMLElement} el - Button html element to be referenced.
     * @returns {void}
     * @private
     */
    _buttonRef(el) {
        this.buttonElement = el;
    }
}
