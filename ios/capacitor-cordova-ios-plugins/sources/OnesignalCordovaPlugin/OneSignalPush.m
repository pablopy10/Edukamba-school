/**
 * Modified MIT License
 *
 * Copyright 2021 OneSignal
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * 1. The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * 2. All copies of substantial portions of the Software may only be used in
 * connection with services provided by OneSignal.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

#import <UIKit/UIKit.h>
#import <objc/runtime.h>

#import "OneSignalPush.h"
#import <OneSignalFramework/OneSignalFramework.h>

NSString *notificationWillShowInForegoundCallbackId;
NSString *notificationClickedCallbackId;
NSString *permissionObserverCallbackId;
NSString *subscriptionObserverCallbackId;
NSString *requestPermissionCallbackId;
NSString *registerForProvisionalAuthorizationCallbackId;

NSString *inAppMessageWillDisplayCallbackId;
NSString *inAppMessageDidDisplayCallbackId;
NSString *inAppMessageWillDismissCallbackId;
NSString *inAppMessageDidDismissCallbackId;
NSString *inAppMessageClickedCallbackId;
NSString *userObserverCallbackId;

OSNotificationClickEvent *actionNotification;
OSNotification *notification;

id<CDVCommandDelegate> pluginCommandDelegate;

bool initDone = false;

void successCallback(NSString *callbackId, NSDictionary *data) {
  CDVPluginResult *commandResult =
      [CDVPluginResult resultWithStatus:CDVCommandStatus_OK
                    messageAsDictionary:data];
  commandResult.keepCallback = @1;
  [pluginCommandDelegate sendPluginResult:commandResult callbackId:callbackId];
}

void successCallbackBoolean(NSString *callbackId, bool param) {
  CDVPluginResult *commandResult =
      [CDVPluginResult resultWithStatus:CDVCommandStatus_OK
                          messageAsBool:param];
  commandResult.keepCallback = @1;
  [pluginCommandDelegate sendPluginResult:commandResult callbackId:callbackId];
}

void successCallbackNSInteger(NSString *callbackId, int param) {
  CDVPluginResult *commandResult =
      [CDVPluginResult resultWithStatus:CDVCommandStatus_OK
                     messageAsNSInteger:param];
  commandResult.keepCallback = @1;
  [pluginCommandDelegate sendPluginResult:commandResult callbackId:callbackId];
}

void successCallbackString(NSString *callbackId, NSString *param) {
  CDVPluginResult *commandResult =
      [CDVPluginResult resultWithStatus:CDVCommandStatus_OK
                        messageAsString:param];
  commandResult.keepCallback = @1;
  [pluginCommandDelegate sendPluginResult:commandResult callbackId:callbackId];
}

void failureCallback(NSString *callbackId, NSDictionary *data) {
  CDVPluginResult *commandResult =
      [CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR
                    messageAsDictionary:data];
  commandResult.keepCallback = @1;
  [pluginCommandDelegate sendPluginResult:commandResult callbackId:callbackId];
}

void processForegroundLifecycleListener(
    OSNotificationWillDisplayEvent *_notif) {
  NSString *data = [_notif.notification stringify];
  NSError *jsonError;
  NSData *objectData = [data dataUsingEncoding:NSUTF8StringEncoding];
  NSDictionary *json =
      [NSJSONSerialization JSONObjectWithData:objectData
                                      options:NSJSONReadingMutableContainers
                                        error:&jsonError];
  if (!jsonError) {
    successCallback(notificationWillShowInForegoundCallbackId, json);
    notification = nil;
  }
}

void processNotificationClicked(OSNotificationClickEvent *event) {
  if (notificationClickedCallbackId != nil) {
    successCallback(notificationClickedCallbackId, [event jsonRepresentation]);
    actionNotification = nil;
  }
}

void initOneSignalObject(NSDictionary *launchOptions) {
  OneSignalWrapper.sdkType = @"cordova";
  OneSignalWrapper.sdkVersion = @"050307";
  [OneSignal initialize:nil withLaunchOptions:launchOptions];
}

/** Helper method to return NSNull if string is empty or nil **/
NSString *getStringOrNSNull(NSString *string) {
  if (string.length > 0) {
    return string;
  } else {
    return [NSNull null];
  }
}

@implementation UIApplication (OneSignalCordovaPush)

static void injectSelectorCordova(Class newClass, SEL newSel, Class addToClass,
                                  SEL makeLikeSel) {
  Method newMeth = class_getInstanceMethod(newClass, newSel);
  IMP imp = method_getImplementation(newMeth);
  const char *methodTypeEncoding = method_getTypeEncoding(newMeth);

  BOOL successful =
      class_addMethod(addToClass, makeLikeSel, imp, methodTypeEncoding);
  if (!successful) {
    class_addMethod(addToClass, newSel, imp, methodTypeEncoding);
    newMeth = class_getInstanceMethod(addToClass, newSel);

    Method orgMeth = class_getInstanceMethod(addToClass, makeLikeSel);

    method_exchangeImplementations(orgMeth, newMeth);
  }
}

+ (void)load {
  method_exchangeImplementations(
      class_getInstanceMethod(self, @selector(setDelegate:)),
      class_getInstanceMethod(self, @selector(setOneSignalCordovaDelegate:)));
}

static Class delegateClass = nil;

- (void)setOneSignalCordovaDelegate:(id<UIApplicationDelegate>)delegate {
  if (delegateClass != nil)
    return;
  delegateClass = [delegate class];

  injectSelectorCordova(
      self.class,
      @selector(oneSignalApplication:didFinishLaunchingWithOptions:),
      delegateClass, @selector(application:didFinishLaunchingWithOptions:));
  [self setOneSignalCordovaDelegate:delegate];
}

- (BOOL)oneSignalApplication:(UIApplication *)application
    didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
  initOneSignalObject(launchOptions);

  if ([self respondsToSelector:
                @selector(oneSignalApplication:didFinishLaunchingWithOptions:)])
    return [self oneSignalApplication:application
        didFinishLaunchingWithOptions:launchOptions];
  return YES;
}

@end

@interface OneSignalPush ()

@property(strong, nonatomic) NSMutableDictionary *notificationWillDisplayCache;
@property(strong, nonatomic) NSMutableDictionary *preventDefaultCache;

@end

@implementation OneSignalPush

- (void)onNotificationPermissionDidChange:(BOOL)permission {
  successCallbackBoolean(permissionObserverCallbackId, permission);
}

- (void)onPushSubscriptionDidChangeWithState:
    (OSPushSubscriptionChangedState *)state {
  NSMutableDictionary *result = [NSMutableDictionary new];

  NSMutableDictionary *previousObject = [NSMutableDictionary new];
  previousObject[@"token"] = getStringOrNSNull(state.previous.token);
  previousObject[@"id"] = getStringOrNSNull(state.previous.id);
  previousObject[@"optedIn"] = @(state.previous.optedIn);
  result[@"previous"] = previousObject;

  NSMutableDictionary *currentObject = [NSMutableDictionary new];
  currentObject[@"token"] = getStringOrNSNull(state.current.token);
  currentObject[@"id"] = getStringOrNSNull(state.current.id);
  currentObject[@"optedIn"] = @(state.current.optedIn);
  result[@"current"] = currentObject;

  successCallback(subscriptionObserverCallbackId, result);
}

- (void)onUserStateDidChangeWithState:(OSUserChangedState *_Nonnull)state {
  NSString *onesignalId = state.current.onesignalId;
  NSString *externalId = state.current.externalId;

  NSMutableDictionary *result = [NSMutableDictionary new];
  NSMutableDictionary *currentObject = [NSMutableDictionary new];
  currentObject[@"onesignalId"] = getStringOrNSNull(onesignalId);
  currentObject[@"externalId"] = getStringOrNSNull(externalId);
  result[@"current"] = currentObject;

  successCallback(userObserverCallbackId, result);
}

- (void)getOnesignalId:(CDVInvokedUrlCommand *)command {
  successCallbackString(command.callbackId, OneSignal.User.onesignalId);
}

- (void)getExternalId:(CDVInvokedUrlCommand *)command {
  successCallbackString(command.callbackId, OneSignal.User.externalId);
}

- (void)setProvidesNotificationSettingsView:(CDVInvokedUrlCommand *)command {
  BOOL providesView = command.arguments[0];
  [OneSignal setProvidesNotificationSettingsView:providesView];
}

- (void)onWillDisplayNotification:(OSNotificationWillDisplayEvent *)event {
  self.notificationWillDisplayCache[event.notification.notificationId] = event;
  [event preventDefault];
  processForegroundLifecycleListener(event);
}

- (void)preventDefault:(CDVInvokedUrlCommand *)command {
  NSString *notificationId = command.arguments[0];
  OSNotificationWillDisplayEvent *event =
      _notificationWillDisplayCache[notificationId];
  if (!event) {
    return;
  }
  [event preventDefault];
  self.preventDefaultCache[event.notification.notificationId] = event;
}

- (void)displayNotification:(CDVInvokedUrlCommand *)command {
  NSString *notificationId = command.arguments[0];
  OSNotificationWillDisplayEvent *event =
      _notificationWillDisplayCache[notificationId];
  if (!event) {
    return;
  }
  [event.notification display];
}

- (void)proceedWithWillDisplay:(CDVInvokedUrlCommand *)command {
  NSString *notificationId = command.arguments[0];
  OSNotificationWillDisplayEvent *event =
      self.notificationWillDisplayCache[notificationId];
  if (!event) {
    return;
  }
  if (self.preventDefaultCache[notificationId]) {
    return;
  }
  [event.notification display];
}

- (void)addForegroundLifecycleListener:(CDVInvokedUrlCommand *)command {
  bool handlerNotSet = notificationWillShowInForegoundCallbackId == nil;
  notificationWillShowInForegoundCallbackId = command.callbackId;
  if (handlerNotSet) {
    [OneSignal.Notifications addForegroundLifecycleListener:self];
  }
}

- (void)onClickNotification:(OSNotificationClickEvent *_Nonnull)event {
  actionNotification = event;
  if (pluginCommandDelegate)
    processNotificationClicked(actionNotification);
}

- (void)addNotificationClickListener:(CDVInvokedUrlCommand *)command {
  bool handlerNotSet = notificationClickedCallbackId == nil;
  notificationClickedCallbackId = command.callbackId;
  if (handlerNotSet) {
    [OneSignal.Notifications addClickListener:self];
  }
}

- (void)init:(CDVInvokedUrlCommand *)command {
  if (initDone) {
    successCallbackBoolean(command.callbackId, true);
    return;
  }
  initDone = true;
  _notificationWillDisplayCache = [NSMutableDictionary new];
  _preventDefaultCache = [NSMutableDictionary new];

  pluginCommandDelegate = self.commandDelegate;

  NSString *appId = (NSString *)command.arguments[0];
  NSString *appIdStr =
      (appId ? [NSString stringWithUTF8String:[appId UTF8String]] : nil);

  [OneSignal initialize:appIdStr withLaunchOptions:nil];
  [OneSignal.InAppMessages addLifecycleListener:self];

  if (actionNotification)
    processNotificationClicked(actionNotification);

  successCallbackBoolean(command.callbackId, true);
}

- (void)setLanguage:(CDVInvokedUrlCommand *)command {
  [OneSignal.User setLanguage:command.arguments[0]];
}

- (void)addPermissionObserver:(CDVInvokedUrlCommand *)command {
  bool handlerNotSet = permissionObserverCallbackId == nil;
  permissionObserverCallbackId = command.callbackId;
  if (handlerNotSet) {
    [OneSignal.Notifications addPermissionObserver:self];
  }
}

- (void)addPushSubscriptionObserver:(CDVInvokedUrlCommand *)command {
  bool handlerNotSet = subscriptionObserverCallbackId == nil;
  subscriptionObserverCallbackId = command.callbackId;
  if (handlerNotSet)
    [OneSignal.User.pushSubscription addObserver:self];
}

- (void)addUserStateObserver:(CDVInvokedUrlCommand *)command {
  bool handlerNotSet = userObserverCallbackId == nil;
  userObserverCallbackId = command.callbackId;
  if (handlerNotSet) {
    [OneSignal.User addObserver:self];
  }
}

- (void)getPushSubscriptionId:(CDVInvokedUrlCommand *)command {
  successCallbackString(command.callbackId, OneSignal.User.pushSubscription.id);
}

- (void)getPushSubscriptionToken:(CDVInvokedUrlCommand *)command {
  successCallbackString(command.callbackId,
                        OneSignal.User.pushSubscription.token);
}

- (void)getPushSubscriptionOptedIn:(CDVInvokedUrlCommand *)command {
  bool optedIn = OneSignal.User.pushSubscription.optedIn;
  successCallbackBoolean(command.callbackId, optedIn);
}

- (void)optInPushSubscription:(CDVInvokedUrlCommand *)command {
  [OneSignal.User.pushSubscription optIn];
}

- (void)optOutPushSubscription:(CDVInvokedUrlCommand *)command {
  [OneSignal.User.pushSubscription optOut];
}

- (void)setLogLevel:(CDVInvokedUrlCommand *)command {
  [OneSignal.Debug setLogLevel:[command.arguments[0] intValue]];
}

- (void)setAlertLevel:(CDVInvokedUrlCommand *)command {
  [OneSignal.Debug setAlertLevel:[command.arguments[0] intValue]];
}

- (void)login:(CDVInvokedUrlCommand *)command {
  [OneSignal login:command.arguments[0]];
}

- (void)logout:(CDVInvokedUrlCommand *)command {
  [OneSignal logout];
}

- (void)addTags:(CDVInvokedUrlCommand *)command {
  [OneSignal.User addTags:command.arguments[0]];
}

- (void)removeTags:(CDVInvokedUrlCommand *)command {
  [OneSignal.User removeTags:command.arguments];
}

- (void)getTags:(CDVInvokedUrlCommand *)command {
  NSDictionary<NSString *, NSString *> *tags = [OneSignal.User getTags];
  successCallback(command.callbackId, tags);
}

- (void)requestPermission:(CDVInvokedUrlCommand *)command {
  requestPermissionCallbackId = command.callbackId;
  [OneSignal.Notifications
       requestPermission:^(BOOL accepted) {
         successCallbackBoolean(requestPermissionCallbackId, accepted);
       }
      fallbackToSettings:[command.arguments[0] boolValue]];
}

- (void)permissionNative:(CDVInvokedUrlCommand *)command {
  OSNotificationPermission permissionNative =
      [OneSignal.Notifications permissionNative];
  successCallbackNSInteger(command.callbackId, permissionNative);
}

- (void)getPermissionInternal:(CDVInvokedUrlCommand *)command {
  bool isPermitted = [OneSignal.Notifications permission];
  successCallbackBoolean(command.callbackId, isPermitted);
}

- (void)canRequestPermission:(CDVInvokedUrlCommand *)command {
  bool canRequest = [OneSignal.Notifications canRequestPermission];
  successCallbackBoolean(command.callbackId, canRequest);
}

- (void)registerForProvisionalAuthorization:(CDVInvokedUrlCommand *)command {
  registerForProvisionalAuthorizationCallbackId = command.callbackId;
  [OneSignal.Notifications
      registerForProvisionalAuthorization:^(BOOL accepted) {
        successCallbackBoolean(registerForProvisionalAuthorizationCallbackId,
                               accepted);
      }];
}

- (void)clearAllNotifications:(CDVInvokedUrlCommand *)command {
  [OneSignal.Notifications clearAll];
}

- (void)removeNotification:(CDVInvokedUrlCommand *)command {}
- (void)removeGroupedNotifications:(CDVInvokedUrlCommand *)command {}

- (void)setPrivacyConsentRequired:(CDVInvokedUrlCommand *)command {
  if (command.arguments.count >= 1)
    [OneSignal setConsentRequired:[command.arguments[0] boolValue]];
}

- (void)setPrivacyConsentGiven:(CDVInvokedUrlCommand *)command {
  if (command.arguments.count >= 1)
    [OneSignal setConsentGiven:[command.arguments[0] boolValue]];
}

- (void)addAliases:(CDVInvokedUrlCommand *)command {
  [OneSignal.User addAliases:command.arguments[0]];
}

- (void)removeAliases:(CDVInvokedUrlCommand *)command {
  [OneSignal.User removeAliases:command.arguments];
}

- (void)addEmail:(CDVInvokedUrlCommand *)command {
  [OneSignal.User addEmail:command.arguments[0]];
}

- (void)removeEmail:(CDVInvokedUrlCommand *)command {
  [OneSignal.User removeEmail:command.arguments[0]];
}

- (void)addSms:(CDVInvokedUrlCommand *)command {
  [OneSignal.User addSms:command.arguments[0]];
}

- (void)removeSms:(CDVInvokedUrlCommand *)command {
  [OneSignal.User removeSms:command.arguments[0]];
}

- (void)onClickInAppMessage:(OSInAppMessageClickEvent *_Nonnull)event {
  if (inAppMessageClickedCallbackId != nil) {
    NSInteger urlTargetInt = event.result.urlTarget;
    NSString *urlTarget;
    switch (urlTargetInt) {
    case 0: urlTarget = @"browser"; break;
    case 1: urlTarget = @"webview"; break;
    case 2: urlTarget = @"replacement"; break;
    default: urlTarget = @"browser"; break;
    }
    NSMutableDictionary *clickResultDict = [NSMutableDictionary new];
    clickResultDict[@"actionId"] = event.result.actionId;
    clickResultDict[@"urlTarget"] = urlTarget;
    clickResultDict[@"closingMessage"] = @(event.result.closingMessage);
    clickResultDict[@"url"] = event.result.url;
    NSDictionary *json = @{
      @"message" : [event.message jsonRepresentation],
      @"result" : clickResultDict
    };
    successCallback(inAppMessageClickedCallbackId, json);
  }
}

- (void)setInAppMessageClickHandler:(CDVInvokedUrlCommand *)command {
  bool handlerNotSet = inAppMessageClickedCallbackId == nil;
  inAppMessageClickedCallbackId = command.callbackId;
  if (handlerNotSet) {
    [OneSignal.InAppMessages addClickListener:self];
  }
}

- (void)setOnWillDisplayInAppMessageHandler:(CDVInvokedUrlCommand *)command {
  inAppMessageWillDisplayCallbackId = command.callbackId;
}

- (void)setOnDidDisplayInAppMessageHandler:(CDVInvokedUrlCommand *)command {
  inAppMessageDidDisplayCallbackId = command.callbackId;
}

- (void)setOnWillDismissInAppMessageHandler:(CDVInvokedUrlCommand *)command {
  inAppMessageWillDismissCallbackId = command.callbackId;
}

- (void)setOnDidDismissInAppMessageHandler:(CDVInvokedUrlCommand *)command {
  inAppMessageDidDismissCallbackId = command.callbackId;
}

- (void)onWillDisplayInAppMessage:
    (OSInAppMessageWillDisplayEvent *_Nonnull)event {
  if (inAppMessageWillDisplayCallbackId != nil) {
    successCallback(inAppMessageWillDisplayCallbackId,
                    [event jsonRepresentation]);
  }
}

- (void)onDidDisplayInAppMessage:
    (OSInAppMessageDidDisplayEvent *_Nonnull)event {
  if (inAppMessageDidDisplayCallbackId != nil) {
    successCallback(inAppMessageDidDisplayCallbackId,
                    [event jsonRepresentation]);
  }
}

- (void)onWillDismissInAppMessage:
    (OSInAppMessageWillDismissEvent *_Nonnull)event {
  if (inAppMessageWillDismissCallbackId != nil) {
    successCallback(inAppMessageWillDismissCallbackId,
                    [event jsonRepresentation]);
  }
}

- (void)onDidDismissInAppMessage:
    (OSInAppMessageDidDismissEvent *_Nonnull)event {
  if (inAppMessageDidDismissCallbackId != nil) {
    successCallback(inAppMessageDidDismissCallbackId,
                    [event jsonRepresentation]);
  }
}

- (void)addTriggers:(CDVInvokedUrlCommand *)command {
  [OneSignal.InAppMessages addTriggers:command.arguments[0]];
}

- (void)removeTriggers:(CDVInvokedUrlCommand *)command {
  [OneSignal.InAppMessages removeTriggers:command.arguments[0]];
}

- (void)clearTriggers:(CDVInvokedUrlCommand *)command {
  [OneSignal.InAppMessages clearTriggers];
}

- (void)setPaused:(CDVInvokedUrlCommand *)command {
  bool pause = [command.arguments[0] boolValue];
  [OneSignal.InAppMessages paused:pause];
}

- (void)isPaused:(CDVInvokedUrlCommand *)command {
  bool paused = [OneSignal.InAppMessages paused];
  successCallbackBoolean(command.callbackId, paused);
}

- (void)addOutcome:(CDVInvokedUrlCommand *)command {
  [OneSignal.Session addOutcome:command.arguments[0]];
}

- (void)addUniqueOutcome:(CDVInvokedUrlCommand *)command {
  [OneSignal.Session addUniqueOutcome:command.arguments[0]];
}

- (void)addOutcomeWithValue:(CDVInvokedUrlCommand *)command {
  [OneSignal.Session addOutcomeWithValue:command.arguments[0]
                                   value:command.arguments[1]];
}

- (void)trackEvent:(CDVInvokedUrlCommand *)command {
  NSString *eventName = command.arguments[0];
  NSDictionary *properties = nil;
  if (command.arguments.count > 1 && command.arguments[1] != [NSNull null]) {
    properties = command.arguments[1];
  }
  [OneSignal.User trackEventWithName:eventName properties:properties];
}

- (void)requestLocationPermission:(CDVInvokedUrlCommand *)command {
  [OneSignal.Location requestPermission];
}

- (void)setLocationShared:(CDVInvokedUrlCommand *)command {
  [OneSignal.Location setShared:[command.arguments[0] boolValue]];
}

- (void)isLocationShared:(CDVInvokedUrlCommand *)command {
  bool isShared = [OneSignal.Location isShared];
  successCallbackBoolean(command.callbackId, isShared);
}

// Live Activities — not available without OneSignalLiveActivities SPM package
- (void)enterLiveActivity:(CDVInvokedUrlCommand *)command {}
- (void)exitLiveActivity:(CDVInvokedUrlCommand *)command {}
- (void)setPushToStartToken:(CDVInvokedUrlCommand *)command {}
- (void)removePushToStartToken:(CDVInvokedUrlCommand *)command {}
- (void)setupDefaultLiveActivity:(CDVInvokedUrlCommand *)command {}
- (void)startDefaultLiveActivity:(CDVInvokedUrlCommand *)command {}

@end
