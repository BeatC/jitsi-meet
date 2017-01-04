/* global config, APP, interfaceConfig, JitsiMeetJS, $ */

import UIEvents from '../../../service/UI/UIEvents';
import UIUtil from '../../../modules/UI/util/UIUtil';

/**
 * Show dialog asking to input SIP number.
 *
 * @returns {void}
 */
export function showSipNumberInput() {
    const defaultNumber = config.defaultSipNumber
        ? config.defaultSipNumber
        : '';
    const titleKey = 'dialog.sipMsg';
    const msgString = `
            <input class="input-control"
                   name="sipNumber" type="text"
                   value="${defaultNumber}" autofocus>`;

    APP.UI.messageHandler.openTwoButtonDialog({
        titleKey,
        msgString,
        leftButtonKey: 'dialog.Dial',

        // eslint-disable-next-line max-params
        submitFunction: (e, v, m, f) => {
            if (v && f.sipNumber) {
                APP.UI.eventEmitter.emit(UIEvents.SIP_DIAL, f.sipNumber);
            }
        },
        focus: ':input:first'
    });
}

/**
 * Handler for dialpad button.
 *
 * @returns {void}
 */
export function dialpadButtonClicked() {
    // TODO show the dialpad box
}


/**
 * Get place for toolbar button.
 * Now it can be in main toolbar or in extended (left) toolbar.
 *
 * @param {string} btn - Button key.
 * @returns {string}
 */
export function getToolbarButtonPlace(btn) {
    if (interfaceConfig.MAIN_TOOLBAR_BUTTONS.includes(btn)) {
        return 'main';
    }

    return 'extended';
}

/**
 * Returns handlers for toolbar buttons.
 *
 * @param {EventEmitter} emitter - Event emitter instance.
 * Temporary solution: will be replaced by redux actions.
 * @returns {Object}
 */
export function getButtonHandlers(emitter) {
    return {
        'toolbar_button_profile': () => {
            JitsiMeetJS.analytics.sendEvent('toolbar.profile.toggled');
            emitter.emit(UIEvents.TOGGLE_PROFILE);
        },
        'toolbar_button_mute': () => {
            const sharedVideoManager = APP.UI.getSharedVideoManager();

            if (APP.conference.audioMuted) {
                // If there's a shared video with the volume "on" and we aren't
                // the video owner, we warn the user
                // that currently it's not possible to unmute.
                if (sharedVideoManager
                    && sharedVideoManager.isSharedVideoVolumeOn()
                    && !sharedVideoManager.isSharedVideoOwner()) {
                    UIUtil.animateShowElement(
                        $('#unableToUnmutePopup'), true, 5000);
                } else {
                    JitsiMeetJS.analytics.sendEvent('toolbar.audio.unmuted');
                    emitter.emit(UIEvents.AUDIO_MUTED, false, true);
                }
            } else {
                JitsiMeetJS.analytics.sendEvent('toolbar.audio.muted');
                emitter.emit(UIEvents.AUDIO_MUTED, true, true);
            }
        },
        'toolbar_button_camera': () => {
            if (APP.conference.videoMuted) {
                JitsiMeetJS.analytics.sendEvent('toolbar.video.enabled');
                emitter.emit(UIEvents.VIDEO_MUTED, false);
            } else {
                JitsiMeetJS.analytics.sendEvent('toolbar.video.disabled');
                emitter.emit(UIEvents.VIDEO_MUTED, true);
            }
        },
        'toolbar_button_link': () => {
            JitsiMeetJS.analytics.sendEvent('toolbar.invite.clicked');
            emitter.emit(UIEvents.INVITE_CLICKED);
        },
        'toolbar_button_chat': () => {
            JitsiMeetJS.analytics.sendEvent('toolbar.chat.toggled');
            emitter.emit(UIEvents.TOGGLE_CHAT);
        },
        'toolbar_contact_list': () => {
            JitsiMeetJS.analytics.sendEvent(
                'toolbar.contacts.toggled');
            emitter.emit(UIEvents.TOGGLE_CONTACT_LIST);
        },
        'toolbar_button_etherpad': () => {
            JitsiMeetJS.analytics.sendEvent('toolbar.etherpad.clicked');
            emitter.emit(UIEvents.ETHERPAD_CLICKED);
        },
        'toolbar_button_sharedvideo': () => {
            JitsiMeetJS.analytics.sendEvent('toolbar.sharedvideo.clicked');
            emitter.emit(UIEvents.SHARED_VIDEO_CLICKED);
        },
        'toolbar_button_desktopsharing': () => {
            if (APP.conference.isSharingScreen) {
                JitsiMeetJS.analytics.sendEvent('toolbar.screen.disabled');
            } else {
                JitsiMeetJS.analytics.sendEvent('toolbar.screen.enabled');
            }
            emitter.emit(UIEvents.TOGGLE_SCREENSHARING);
        },
        'toolbar_button_fullScreen': () => {
            JitsiMeetJS.analytics.sendEvent('toolbar.fullscreen.enabled');

            emitter.emit(UIEvents.TOGGLE_FULLSCREEN);
        },
        'toolbar_button_sip': () => {
            JitsiMeetJS.analytics.sendEvent('toolbar.sip.clicked');
            showSipNumberInput();
        },
        'toolbar_button_dialpad': () => {
            JitsiMeetJS.analytics.sendEvent('toolbar.sip.dialpad.clicked');
            dialpadButtonClicked();
        },
        'toolbar_button_settings': () => {
            JitsiMeetJS.analytics.sendEvent('toolbar.settings.toggled');
            emitter.emit(UIEvents.TOGGLE_SETTINGS);
        },
        'toolbar_button_hangup': () => {
            JitsiMeetJS.analytics.sendEvent('toolbar.hangup');
            emitter.emit(UIEvents.HANGUP);
        },
        'toolbar_button_raisehand': () => {
            JitsiMeetJS.analytics.sendEvent('toolbar.raiseHand.clicked');
            APP.conference.maybeToggleRaisedHand();
        }
    };
}
