/**
 * @author - itsNaren
 * @description - Message controller
 * @date - 2021-05-31 20:18:54
**/
var Message = require('../models/message');
const User = require('../models/user');
const moment = require('moment');
const { loadFcmMessage, loadFcmTopics, sendFcmMessagePromise } = require('../utils/fcm');
const { errorHandler, successHandler } = require('../utils/handler');
const { FCM_CONSTANT, toJapanese } = require('../utils/constant');
module.exports = {
    insertMessages: async (req, res) => {
        var { isForAll, userIds, message } = req.body;
        let bodyMessage = message;
        if (isForAll) {
            try {
                let newMessages = new Message({ empId: 'FORALL', title: '通知メッセージ ' + moment(new Date()).format("DD/MM/YYYY"), message: message || bodyMessage, isForAll: true, isRead: true });
                await newMessages.save();
            } catch (error) {
                errorHandler(req, res, error);
            }
            let topicMessageOption = loadFcmTopics(
                FCM_CONSTANT.alert_medical_report,
                '通知メッセージ',
                bodyMessage
            );
            await sendFcmMessagePromise(topicMessageOption)
                .then(() => {
                    successHandler(req, res, toJapanese['Message(s) has been sent'], { success: true });
                })
                .catch(e => {
                    errorHandler(req, res, new Error('FCM Error, Notifications unavailable for this user'));
                });
        } else {
            await User.find({ empId: { $in: userIds } }, 'empId fcmToken')
                .exec(async (err, users) => {
                    if (err) errorHandler(req, res, err);
                    else {
                        try {
                            let tokens = [], messages = [];
                            users.forEach(user => {
                                tokens.push(user.fcmToken);
                                messages.push({ empId: user.empId, title: '通知メッセージ ' + moment(new Date()).format("YYYY/MM/DD"), message: message || bodyMessage, isForAll: false });
                            });
                            await Message.insertMany(messages);
                            let messageOption = loadFcmMessage(
                                tokens,
                                '通知メッセージ',
                                bodyMessage
                            );
                            await sendFcmMessagePromise(messageOption)
                                .then(() => {
                                    successHandler(req, res, toJapanese['Message(s) has been sent'], { success: true });
                                })
                                .catch(e => {
                                    errorHandler(req, res, new Error('FCM Error, Notifications unavailable for this user'));
                                });
                        } catch (error) {
                            errorHandler(req, res, error);
                        }
                    }
                });
        }
    },
    viewMessages: async (req, res) => {
        await Message
            .find({ empId: { $in: [req.params.empId, 'FORALL'] } }, 'title message createdAt isRead')
            .sort({ createdAt: -1 })
            .exec(async (err, data) => {
                if (err) errorHandler(req, res, err);
                else {
                    await Message.updateMany({ empId: req.params.empId }, { isRead: true });
                    successHandler(req, res, toJapanese['Viewing messages'], data);
                }
            })
    }
};