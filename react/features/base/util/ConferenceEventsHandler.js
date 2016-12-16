/* global APP, JitsiMeetJS */

const ConferenceEvents = JitsiMeetJS.events.conference;
const logger = require('jitsi-meet-logger').getLogger(__filename);

export default class ConferenceEventsHandler {
    constructor(room) {
        this._room = room;
    }
    _setupConferenceListeners() {
        // add local streams when joined to the conference
        this._room.on(ConferenceEvents.CONFERENCE_JOINED, () => {
            APP.UI.mucJoined();
            APP.API.notifyConferenceJoined(APP.conference.roomName);
            APP.UI.markVideoInterrupted(false);
        });

        this._room.on(
            ConferenceEvents.AUTH_STATUS_CHANGED,
            (authEnabled, authLogin) => {
                APP.UI.updateAuthInfo(authEnabled, authLogin);
            }
        );

        this._room.on(ConferenceEvents.SUBJECT_CHANGED, subject => {
            APP.UI.setSubject(subject);
        });

        this._room.on(ConferenceEvents.USER_JOINED, (id, user) => {
            if (user.isHidden()) {
                return;
            }

            logger.log('USER %s connnected', id, user);
            APP.API.notifyUserJoined(id);
            APP.UI.addUser(user);

            // check the roles for the new user and reflect them
            APP.UI.updateUserRole(user);
        });
        this._room.on(ConferenceEvents.USER_LEFT, (id, user) => {
            logger.log('USER %s LEFT', id, user);
            APP.API.notifyUserLeft(id);
            APP.UI.removeUser(id, user.getDisplayName());
            APP.UI.onSharedVideoStop(id);
        });


        this._room.on(ConferenceEvents.USER_ROLE_CHANGED, (id, role) => {
            if (this.isLocalId(id)) {
                logger.info(`My role changed, new role: ${role}`);
                if (this.isModerator !== this._room.isModerator()) {
                    this.isModerator = this._room.isModerator();
                    APP.UI.updateLocalRole(this._room.isModerator());
                }
            } else {
                const user = this._room.getParticipantById(id);

                if (user) {
                    APP.UI.updateUserRole(user);
                }
            }
        });

        this._room.on(ConferenceEvents.TRACK_ADDED, (track) => {
            if (!track || track.isLocal()) {
                return;
            }

            track.on(TrackEvents.TRACK_VIDEOTYPE_CHANGED, (type) => {
                APP.UI.onPeerVideoTypeChanged(track.getParticipantId(), type);
            });
            APP.UI.addRemoteStream(track);
        });

        this._room.on(ConferenceEvents.TRACK_REMOVED, (track) => {
            if (!track || track.isLocal()) {
                return;
            }

            APP.UI.removeRemoteStream(track);
        });

        this._room.on(ConferenceEvents.TRACK_MUTE_CHANGED, (track) => {
            if (!track) {
                return;
            }

            const handler = (track.getType() === 'audio')?
                APP.UI.setAudioMuted : APP.UI.setVideoMuted;
            let id;
            const mute = track.isMuted();
            if(track.isLocal()){
                id = APP.conference.getMyUserId();
                if(track.getType() === 'audio') {
                    this.audioMuted = mute;
                } else {
                    this.videoMuted = mute;
                }
            } else {
                id = track.getParticipantId();
            }
            handler(id , mute);
        });
        this._room.on(ConferenceEvents.TRACK_AUDIO_LEVEL_CHANGED, (id, lvl) => {
            if(this.isLocalId(id) && localAudio && localAudio.isMuted()) {
                lvl = 0;
            }

            if(config.debug)
            {
                this.audioLevelsMap[id] = lvl;
                if(config.debugAudioLevels)
                    logger.log(`AudioLevel:${id}/${lvl}`);
            }

            APP.UI.setAudioLevel(id, lvl);
        });

        this._room.on(ConferenceEvents.TALK_WHILE_MUTED, () => {
            APP.UI.showToolbar(6000);
            UIUtil.animateShowElement($('#talkWhileMutedPopup'), true, 5000);
        });

        /*
         room.on(ConferenceEvents.IN_LAST_N_CHANGED, (inLastN) => {
         //FIXME
         if (config.muteLocalVideoIfNotInLastN) {
         // TODO mute or unmute if required
         // mark video on UI
         // APP.UI.markVideoMuted(true/false);
         }
         });
         */
        this._room.on(
            ConferenceEvents.LAST_N_ENDPOINTS_CHANGED, (ids, enteringIds) => {
                APP.UI.handleLastNEndpoints(ids, enteringIds);
            });
        this._room.on(
            ConferenceEvents.PARTICIPANT_CONN_STATUS_CHANGED,
            (id, isActive) => {
                APP.UI.participantConnectionStatusChanged(id, isActive);
            });
        this._room.on(ConferenceEvents.DOMINANT_SPEAKER_CHANGED, (id) => {
            if (this.isLocalId(id)) {
                this.isDominantSpeaker = true;
                this.setRaisedHand(false);
            } else {
                this.isDominantSpeaker = false;
                var participant = this._room.getParticipantById(id);
                if (participant) {
                    APP.UI.setRaisedHandStatus(participant, false);
                }
            }
            APP.UI.markDominantSpeaker(id);
        });

        if (!interfaceConfig.filmStripOnly) {
            this._room.on(ConferenceEvents.CONNECTION_INTERRUPTED, () => {
                APP.UI.markVideoInterrupted(true);
            });
            this._room.on(ConferenceEvents.CONNECTION_RESTORED, () => {
                APP.UI.markVideoInterrupted(false);
            });
            this._room.on(ConferenceEvents.MESSAGE_RECEIVED, (id, text, ts) => {
                let nick = getDisplayName(id);
                APP.API.notifyReceivedChatMessage(id, nick, text, ts);
                APP.UI.addMessage(id, nick, text, ts);
            });
        }

        this._room.on(ConferenceEvents.CONNECTION_INTERRUPTED, () => {
            APP.UI.showLocalConnectionInterrupted(true);
        });

        this._room.on(ConferenceEvents.CONNECTION_RESTORED, () => {
            APP.UI.showLocalConnectionInterrupted(false);
        });

        this._room.on(ConferenceEvents.DISPLAY_NAME_CHANGED, (id, displayName) => {
            const formattedDisplayName
                = displayName.substr(0, MAX_DISPLAY_NAME_LENGTH);
            APP.API.notifyDisplayNameChanged(id, formattedDisplayName);
            APP.UI.changeDisplayName(id, formattedDisplayName);
        });

        this._room.on(ConferenceEvents.PARTICIPANT_PROPERTY_CHANGED,
            (participant, name, oldValue, newValue) => {
                if (name === 'raisedHand') {
                    APP.UI.setRaisedHandStatus(participant, newValue);
                }
            });

        this._room.on(ConferenceEvents.RECORDER_STATE_CHANGED, (status, error) => {
            logger.log('Received recorder status change: ', status, error);
            APP.UI.updateRecordingState(status);
        });

        this._room.on(ConferenceEvents.KICKED, () => {
            APP.UI.hideStats();
            APP.UI.notifyKicked();
            // FIXME close
        });

        this._room.on(ConferenceEvents.SUSPEND_DETECTED, () => {
            // After wake up, we will be in a state where conference is left
            // there will be dialog shown to user.
            // We do not want video/audio as we show an overlay and after it
            // user need to rejoin or close, while waking up we can detect
            // camera wakeup as a problem with device.
            // We also do not care about device change, which happens
            // on resume after suspending PC.
            if (this.deviceChangeListener) {
                JitsiMeetJS.mediaDevices.removeEventListener(
                    JitsiMeetJS.events.mediaDevices.DEVICE_LIST_CHANGED,
                    this.deviceChangeListener);
            }

            // stop local video
            if (localVideo) {
                localVideo.dispose();
            }

            // stop local audio
            if (localAudio) {
                localAudio.dispose();
            }

            // show overlay
            APP.UI.showSuspendedOverlay();
        });

        this._room.on(ConferenceEvents.DTMF_SUPPORT_CHANGED, (isDTMFSupported) => {
            APP.UI.updateDTMFSupport(isDTMFSupported);
        });

        this._room.on(ConnectionQualityEvents.LOCAL_STATS_UPDATED,
            (stats) => {
                APP.UI.updateLocalStats(stats.connectionQuality, stats);

            });

        this._room.on(ConnectionQualityEvents.REMOTE_STATS_UPDATED,
            (id, stats) => {
                APP.UI.updateRemoteStats(id, stats.connectionQuality, stats);
            });

        this._room.addCommandListener(this.commands.defaults.ETHERPAD, ({value}) => {
            APP.UI.initEtherpad(value);
        });

        this._room.addCommandListener(
            this.commands.defaults.AVATAR_URL,
            (data, from) => {
                APP.UI.setUserAvatarUrl(from, data.value);
            });

        this._room.addCommandListener(this.commands.defaults.AVATAR_ID,
            (data, from) => {
                APP.UI.setUserAvatarID(from, data.value);
            });

        this._room.on(
            ConferenceEvents.START_MUTED_POLICY_CHANGED,
            ({ audio, video }) => {
                APP.UI.onStartMutedChanged(audio, video);
            }
        );
        this._room.on(ConferenceEvents.STARTED_MUTED, () => {
            (this._room.isStartAudioMuted() || this._room.isStartVideoMuted())
            && APP.UI.notifyInitiallyMuted();
        });

        this._room.on(
            ConferenceEvents.AVAILABLE_DEVICES_CHANGED, function (id, devices) {
                APP.UI.updateDevicesAvailability(id, devices);
            }
        );

        this._room.addCommandListener(
            this.commands.defaults.SHARED_VIDEO, ({ value, attributes }, id) => {

                if (attributes.state === 'stop') {
                    APP.UI.onSharedVideoStop(id, attributes);
                } else if (attributes.state === 'start') {
                    APP.UI.onSharedVideoStart(id, value, attributes);
                } else if (attributes.state === 'playing'
                    || attributes.state === 'pause') {
                    APP.UI.onSharedVideoUpdate(id, value, attributes);
                }
            });

        this._room.addCommandListener(this.commands.defaults.EMAIL, (data, from) => {
            APP.UI.setUserEmail(from, data.value);
        });
    }
}
