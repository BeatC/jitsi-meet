/* global APP, JitsiMeetJS, interfaceConfig */
import UIEvents from '../../../../service/UI/UIEvents';
import {
    VIDEO_CONTAINER_TYPE
} from '../../../../modules/UI/videolayout/VideoContainer';
import AuthHandler from '../../../../modules/UI/authentication/AuthHandler';

const logger = require('jitsi-meet-logger').getLogger(__filename);

/**
 * Class UIEventsHandler setting handlers for UI events.
 *
 * @class UIEventsHandler
 */
export default class UIEventsHandler {

    /**
     * Constructor of UIEventsHandler class.
     *
     * @param {Object} room - Conference room object.
     */
    constructor(room) {
        this._setupUIListeners();
        this._room = room;
    }

    /**
     * Handler for external installation cancelled event.
     *
     * @private
     * @returns {void}
     */
    _handleExternalInstallationCanceled() {
        // Wait a little bit more just to be sure that we won't miss the
        // extension installation
        setTimeout(() => {
            DSExternalInstallationInProgress = false;
        }, 500);
    }

    /**
     * Handler for open extension store event.
     *
     * @param {string} url - Extension store window URL.
     * @private
     * @returns {void}
     */
    _handleOpenExtensionStore(url) {
        const windowName = 'extension_store_window';
        const params = 'resizable,scrollbars=yes,status=1';

        window.open(url, windowName, params);
    }

    /**
     * Handler for message created event.
     *
     * @param {string} message - Message string.
     * @private
     * @returns {void}
     */
    _handleMessageCreated(message) {
        APP.API.notifySendingChatMessage(message);
        this._room.sendTextMessage(message);
    }

    /**
     *
     * @param startAudioMuted
     * @param startVideoMuted
     * @private
     * @returns {void}
     */
    _handleStartMutedChanged(startAudioMuted, startVideoMuted) {
        this._room.setStartMutedPolicy({
            audio: startAudioMuted,
            video: startVideoMuted
        });
    }

    /**
     *
     * @param url
     * @param state
     * @param time
     * @param isMuted
     * @param volume
     * @private
     * @returns {void}
     */
    _handleUpdateSharedVideo(url, state, time, isMuted, volume) {
        // send start and stop commands once, and remove any updates
        // that had left
        if (state === 'stop' || state === 'start' || state === 'playing') {
            this._room.removeCommand(this.commands.defaults.SHARED_VIDEO);
            this._room.sendCommandOnce(this.commands.defaults.SHARED_VIDEO, {
                value: url,
                attributes: {
                    state,
                    time,
                    muted: isMuted,
                    volume
                }
            });
        }
        else {
            // in case of paused, in order to allow late users to join
            // paused
            this._room.removeCommand(this.commands.defaults.SHARED_VIDEO);
            this._room.sendCommand(this.commands.defaults.SHARED_VIDEO, {
                value: url,
                attributes: {
                    state,
                    time,
                    muted: isMuted,
                    volume
                }
            });
        }
    }

    /**
     *
     * @private
     * @returns {void}
     */
    _handleLogout() {
        AuthHandler.logout(this._room).then(url => {
            if (url) {
                window.location.href = url;
            } else {
                this.hangup(true);
            }
        });
    }

    /**
     *
     * @private
     * @returns {void}
     */
    _setupUIListeners() {
        APP.UI.addListener(UIEvents.EXTERNAL_INSTALLATION_CANCELED, this._handleExternalInstallationCanceled);
        APP.UI.addListener(UIEvents.OPEN_EXTENSION_STORE, this._handleOpenExtensionStore);

        APP.UI.addListener(UIEvents.AUDIO_MUTED, muteLocalAudio);
        APP.UI.addListener(UIEvents.VIDEO_MUTED, muteLocalVideo);

        if (!interfaceConfig.filmStripOnly) {
            APP.UI.addListener(UIEvents.MESSAGE_CREATED, this._handleMessageCreated);
        }

        APP.UI.addListener(UIEvents.NICKNAME_CHANGED, changeLocalDisplayName);

        APP.UI.addListener(UIEvents.START_MUTED_CHANGED,
            this._handleStartMutedChanged
        );

        APP.UI.addListener(UIEvents.EMAIL_CHANGED, changeLocalEmail);


        APP.UI.addListener(
            UIEvents.TOGGLE_SCREENSHARING, this.toggleScreenSharing.bind(this)
        );

        APP.UI.addListener(UIEvents.UPDATE_SHARED_VIDEO,
            this._handleUpdateSharedVideo);

        // call hangup
        APP.UI.addListener(UIEvents.HANGUP, () => {
            this.hangup(true);
        });

        // logout
        APP.UI.addListener(UIEvents.LOGOUT, this._handleLogout);

        APP.UI.addListener(UIEvents.SIP_DIAL, sipNumber => {
            this._room.dial(sipNumber);
        });

        APP.UI.addListener(UIEvents.RESOLUTION_CHANGED,
            (id, oldResolution, newResolution, delay) => {
                const logObject = {
                    id: 'resolution_change',
                    participant: id,
                    oldValue: oldResolution,
                    newValue: newResolution,
                    delay
                };

                this._room.sendApplicationLog(JSON.stringify(logObject));

                // We only care about the delay between simulcast streams.
                // Longer delays will be caused by something else and will just
                // poison the data.
                if (delay < 2000) {
                    JitsiMeetJS.analytics.sendEvent('stream.switch.delay',
                        { value: delay });
                }
            });

        // Starts or stops the recording for the conference.
        APP.UI.addListener(UIEvents.RECORDING_TOGGLED, options => {
            this._room.toggleRecording(options);
        });

        APP.UI.addListener(UIEvents.SUBJECT_CHANGED, topic => {
            this._room.setSubject(topic);
        });

        APP.UI.addListener(UIEvents.USER_KICKED, id => {
            this._room.kickParticipant(id);
        });

        APP.UI.addListener(UIEvents.REMOTE_AUDIO_MUTED, id => {
            this._room.muteParticipant(id);
        });

        APP.UI.addListener(UIEvents.AUTH_CLICKED, () => {
            AuthHandler.authenticate(this._room);
        });

        APP.UI.addListener(UIEvents.SELECTED_ENDPOINT, id => {
            try {
                // do not try to select participant if there is none (we are
                // alone in the room), otherwise an error will be thrown cause
                // reporting mechanism is not available (datachannels currently)
                if (this._room.getParticipants().length === 0) {
                    return;
                }

                this._room.selectParticipant(id);
            } catch (e) {
                JitsiMeetJS.analytics.sendEvent('selectParticipant.failed');
                reportError(e);
            }
        });

        APP.UI.addListener(UIEvents.PINNED_ENDPOINT, (smallVideo, isPinned) => {
            const smallVideoId = smallVideo.getId();
            const isLocal = APP.conference.isLocalId(smallVideoId);

            const eventName
                = (isPinned ? 'pinned' : 'unpinned') + '.' +
                (isLocal ? 'local' : 'remote');
            const participantCount = this._room.getParticipantCount();

            JitsiMeetJS.analytics.sendEvent(
                eventName,
                { value: participantCount });

            // FIXME why VIDEO_CONTAINER_TYPE instead of checking if
            // the participant is on the large video ?
            if (smallVideo.getVideoType() === VIDEO_CONTAINER_TYPE
                && !isLocal) {

                // When the library starts supporting multiple pins we would
                // pass the isPinned parameter together with the identifier,
                // but currently we send null to indicate that we unpin the
                // last pinned.
                try {
                    this._room.pinParticipant(isPinned ? smallVideoId : null);
                } catch (e) {
                    reportError(e);
                }
            }
        });

        this._setupDeviceListeners();
    }

    _setupDeviceListeners() {
        APP.UI.addListener(
            UIEvents.VIDEO_DEVICE_CHANGED,
            cameraDeviceId => {
                JitsiMeetJS.analytics.sendEvent('settings.changeDevice.video');
                createLocalTracks({
                    devices: [ 'video' ],
                    cameraDeviceId,
                    micDeviceId: null
                })
                    .then(([ stream ]) => {
                        this.useVideoStream(stream);
                        logger.log('switched local video device');
                        APP.settings.setCameraDeviceId(cameraDeviceId, true);
                    })
                    .catch(err => {
                        APP.UI.showDeviceErrorDialog(null, err);
                        APP.UI.setSelectedCameraFromSettings();
                    });
            }
        );

        APP.UI.addListener(
            UIEvents.AUDIO_DEVICE_CHANGED,
            micDeviceId => {
                JitsiMeetJS.analytics.sendEvent(
                    'settings.changeDevice.audioIn');
                createLocalTracks({
                    devices: [ 'audio' ],
                    cameraDeviceId: null,
                    micDeviceId
                })
                    .then(([ stream ]) => {
                        this.useAudioStream(stream);
                        logger.log('switched local audio device');
                        APP.settings.setMicDeviceId(micDeviceId, true);
                    })
                    .catch(err => {
                        APP.UI.showDeviceErrorDialog(err, null);
                        APP.UI.setSelectedMicFromSettings();
                    });
            }
        );

        APP.UI.addListener(
            UIEvents.AUDIO_OUTPUT_DEVICE_CHANGED,
            audioOutputDeviceId => {
                JitsiMeetJS.analytics.sendEvent(
                    'settings.changeDevice.audioOut');
                APP.settings.setAudioOutputDeviceId(audioOutputDeviceId)
                    .then(() => logger.log('changed audio output device'))
                    .catch(err => {
                        let message = 'Failed to change audio output device. ';

                        message += 'Default or previously set audio output ';
                        message += 'device will be used instead.';
                        logger.warn(message, err);
                        APP.UI.setSelectedAudioOutputFromSettings();
                    });
            }
        );
    }
}
