/* global APP, $ */
import React from 'react';

import defaultToolbarButtons from './defaultToolbarButtons';

import Toolbar from './Toolbar';
import UIEvents from '../../../../service/UI/UIEvents';
import UIUtil from '../../../../modules/UI/util/UIUtil';

/**
 * Class representing extended toolbar.
 *
 * @class ExtendedToolbar
 */
export default class ExtendedToolbar extends Toolbar {

    /**
     * Constructor of the extended toolbar component.
     *
     * @param {Object} props - React props for the component.
     */
    constructor(props) {
        super(props);

        // Setting place for buttons
        this._place = 'extended';
    }

    /**
     * Initializes UI handlers for toolbar.
     *
     * @protected
     * @override
     * @returns {void}
     */
    _initUIHandlers() {
        APP.UI.addListener(UIEvents.SIDE_TOOLBAR_CONTAINER_TOGGLED,
            containerId => {
                this._handleSideToolbarContainerToggled(containerId);
            });

        APP.UI.addListener(UIEvents.LOCAL_RAISE_HAND_CHANGED,
            isRaisedHand => {
                const raiseHandId = 'toolbar_button_raisehand';

                APP.UI.Toolbar._setToggledState(raiseHandId, isRaisedHand);
            });

        if (!APP.tokenData.isGuest) {
            $('#toolbar_button_profile').addClass('unclickable');
            UIUtil.removeTooltip(
                document.getElementById('toolbar_button_profile'));
        }
    }

    /**
     * Handles the side toolbar toggle.
     *
     * @param {string} containerId - The identifier of the container element.
     * @returns {void}
     */
    _handleSideToolbarContainerToggled(containerId) {
        Object.keys(defaultToolbarButtons).forEach(
            id => {
                const button = defaultToolbarButtons[id];

                if (!UIUtil.isButtonEnabled(id)) {
                    return;
                }

                if (button.sideContainerId
                    && button.sideContainerId === containerId) {
                    UIUtil.buttonClick(button.id, 'selected');

                    return;
                }
            }
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
                id = 'extendedToolbar' >
                <div id = 'extendedToolbarButtons'>
                    { this._getButtons() }
                </div>
                <a
                    className = 'button icon-feedback'
                    id = 'feedbackButton' />
                <div id = 'sideToolbarContainer' />
            </div>
        );
    }
}
