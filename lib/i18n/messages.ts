import type { I18nLocale } from "@/lib/i18n/locales";
import { EXTENSION_EN, type ExtensionKey } from "@/lib/i18n/extensionMessages";
import { EXTENSION_RU } from "@/lib/i18n/extensionMessagesRu";
import { EXTENSION_DE } from "@/lib/i18n/extensionMessagesDe";

export type CoreTranslationKey =
  | "nav.spots"
  | "nav.visit"
  | "nav.search"
  | "nav.friends"
  | "nav.map"
  | "nav.messages"
  | "nav.myChats"
  | "nav.myProfile"
  | "nav.create"
  | "nav.saveLocation"
  | "auth.signIn"
  | "auth.signOut"
  | "common.loading"
  | "common.tryAgain"
  | "common.somethingWentWrong"
  | "common.cancel"
  | "common.delete"
  | "common.close"
  | "common.back"
  | "profile.myProfile"
  | "profile.officialProfile"
  | "profile.follow"
  | "profile.unfollow"
  | "profile.message"
  | "profile.friends"
  | "profile.followers"
  | "profile.posts"
  | "profile.spots"
  | "profile.collections"
  | "profile.saved"
  | "profile.mySpots"
  | "profile.noSavedSpotsYet"
  | "profile.noSavedSpotsYetSubtitle"
  | "profile.noMySpotsYet"
  | "profile.noMySpotsYetSubtitle"
  | "profile.channels"
  | "profile.viewProfile"
  | "profile.openMyProfile"
  | "profile.editProfile"
  | "profile.shareProfile"
  | "profile.galleryTitle"
  | "profile.gallerySubtitle"
  | "profile.galleryEmpty"
  | "profile.galleryMediaSubtitle"
  | "profile.galleryEmptyHint"
  | "profile.galleryStatPhotoOne"
  | "profile.galleryStatPhotoMany"
  | "profile.galleryStatVideoOne"
  | "profile.galleryStatVideoMany"
  | "profile.galleryAdd"
  | "profile.galleryAddPhoto"
  | "profile.galleryPhotosOnlyHint"
  | "profile.galleryUploading"
  | "profile.galleryUploadFailed"
  | "profile.galleryEditor.crop"
  | "profile.galleryEditor.effects"
  | "profile.galleryEditor.caption"
  | "profile.galleryEditor.captionLabel"
  | "profile.galleryEditor.next"
  | "profile.galleryEditor.upload"
  | "profile.galleryEditor.reset"
  | "profile.galleryEditor.rotate"
  | "profile.galleryEditor.zoomIn"
  | "profile.galleryEditor.zoomOut"
  | "profile.galleryEditor.ratioSquare"
  | "profile.galleryEditor.ratioPortrait"
  | "profile.galleryEditor.ratioOriginal"
  | "profile.galleryEditor.effect.original"
  | "profile.galleryEditor.effect.brightness"
  | "profile.galleryEditor.effect.contrast"
  | "profile.galleryEditor.effect.saturation"
  | "profile.galleryEditor.effect.warmth"
  | "profile.galleryEditor.effect.fade"
  | "profile.galleryEditor.effect.blackWhite"
  | "profile.galleryOpenPhoto"
  | "profile.galleryOpenVideo"
  | "profile.galleryPhotoLabel"
  | "profile.galleryVideoLabel"
  | "profile.galleryPrevious"
  | "profile.galleryNext"
  | "profile.galleryUnavailable"
  | "profile.galleryActions"
  | "profile.galleryLabel"
  | "profile.galleryTitleUser"
  | "profile.galleryFriendsOnly"
  | "profile.galleryPrivate"
  | "profile.galleryItemActions"
  | "profile.galleryAddDescription"
  | "profile.galleryEditDescription"
  | "profile.galleryDescriptionPlaceholder"
  | "profile.gallerySaveDescription"
  | "profile.galleryDeleteConfirmTitle"
  | "profile.galleryDeleteConfirmBody"
  | "profile.galleryDescriptionSaved"
  | "profile.galleryDeleted"
  | "profile.galleryVisibility.sectionTitle"
  | "profile.galleryVisibility.everyone"
  | "profile.galleryVisibility.followers"
  | "profile.galleryVisibility.friends"
  | "profile.galleryVisibility.selected"
  | "profile.openGallery"
  | "channels.new"
  | "channels.create"
  | "channels.creating"
  | "channels.namePlaceholder"
  | "channels.descriptionPlaceholder"
  | "channels.emptyTitle"
  | "channels.emptyOwner"
  | "channels.emptyViewer"
  | "channels.emptyItems"
  | "channels.invalid"
  | "channels.itemCountOne"
  | "channels.itemCountMany"
  | "channels.visibility.public"
  | "channels.visibility.private"
  | "menu.channels"
  | "menu.channelsDesc"
  | "profile.noPostsYet"
  | "profile.noPostsYetSubtitle"
  | "profile.noPublicSpotsYet"
  | "profile.loading"
  | "profile.updating"
  | "profile.updatedSuccess"
  | "profile.storyShared"
  | "profile.loadTimeout"
  | "profile.sessionTimeout"
  | "profile.dataTimeout"
  | "profile.postsTimeout"
  | "profile.completeFirst"
  | "profile.unableToLoad"
  | "profile.connectionsPartialLoad"
  | "profile.postsPartialLoad"
  | "profile.noFollowersYet"
  | "profile.noFriendsYet"
  | "profile.followsYou"
  | "profile.removeFollower"
  | "profile.removeFollowerConfirmTitle"
  | "profile.removeFollowerConfirmBody"
  | "profile.mutualFollow"
  | "profile.notSignedIn"
  | "profile.signInPrompt"
  | "profile.loginNow"
  | "profile.signInToUpload"
  | "profile.unableToSavePhoto"
  | "profile.unableToUploadPhoto"
  | "profile.userNotFound"
  | "profile.backToSearch"
  | "profile.openProfileMenu"
  | "profile.changePhoto"
  | "profile.addStory"
  | "profile.spotFallback"
  | "menu.title"
  | "menu.settings"
  | "menu.settingsDesc"
  | "menu.collections"
  | "menu.collectionsDesc"
  | "menu.help"
  | "menu.helpDesc"
  | "menu.signOutDesc"
  | "share.title"
  | "share.copied"
  | "share.copyLink"
  | "share.downloadQr"
  | "share.share"
  | "share.qrUnavailable"
  | "share.errorQr"
  | "share.errorCopy"
  | "share.errorShare"
  | "share.nativeTitle"
  | "share.nativeText"
  | "collections.new"
  | "collections.cancel"
  | "collections.namePlaceholder"
  | "collections.descriptionPlaceholder"
  | "collections.create"
  | "collections.creating"
  | "collections.emptyTitle"
  | "collections.emptyOwner"
  | "collections.emptyViewer"
  | "collections.spotCountOne"
  | "collections.spotCountMany"
  | "collections.visibility.public"
  | "collections.visibility.friends"
  | "collections.visibility.invite"
  | "collections.visibility.private"
  | "content.delete"
  | "content.deleteSpot"
  | "content.deleteTitle"
  | "content.deleteBody"
  | "content.deleteSpotTitle"
  | "content.deleteSpotBody"
  | "content.editPublication"
  | "content.deletePublication"
  | "content.deletePublicationTitle"
  | "content.deletePublicationBody"
  | "content.publicationActions"
  | "content.saveChanges"
  | "content.savingChanges"
  | "content.editCaptionLabel"
  | "content.editCaptionPlaceholder"
  | "content.unableToSaveEdit"
  | "content.spotDeleted"
  | "content.unableToDelete"
  | "map.loading"
  | "map.onlineNearby"
  | "map.nobodyOnline"
  | "map.becomeOnline"
  | "map.hideFromMap"
  | "map.connecting"
  | "map.visibleOnMap"
  | "map.hiddenFromMap"
  | "map.allowLocationAccess"
  | "map.couldNotGetLocation"
  | "map.couldNotLoadMap"
  | "map.error.notLoggedIn"
  | "map.error.permissionDenied"
  | "map.error.geolocationUnsupported"
  | "map.error.saveFailed"
  | "map.error.tableMissing"
  | "map.error.invalidCoords"
  | "map.hiddenSuccess"
  | "map.error.loadFailed"
  | "map.userOnline"
  | "map.openInMaps"
  | "map.you"
  | "map.centerLocation"
  | "map.zoomIn"
  | "map.zoomOut"
  | "map.myLocation"
  | "map.mapCenter"
  | "map.mapLabel"
  | "map.userIsLive"
  | "map.closeProfileCard"
  | "map.closeSpotDetails"
  | "map.noPreview"
  | "map.locationAvailable"
  | "map.openSpot"
  | "map.saveThisPlace"
  | "map.createTextCard"
  | "map.viewSpot"
  | "map.seeSpot"
  | "map.placeActionsTitle"
  | "map.actionSavePlace"
  | "map.actionGoToPlace"
  | "map.actionMarkPlace"
  | "map.markTextPlaceholder"
  | "map.markTextRequired"
  | "map.markAddPhotoCamera"
  | "map.markAddPhotoGallery"
  | "map.markRetakePhoto"
  | "map.markRemovePhoto"
  | "map.markDiscardConfirm"
  | "map.markPublish"
  | "map.markEdit"
  | "map.markOpenInGoogleMaps"
  | "map.markPublished"
  | "map.markCategory.traffic"
  | "map.markCategory.roadClosed"
  | "map.markCategory.police"
  | "map.markCategory.parking"
  | "map.markCategory.danger"
  | "map.markCategory.event"
  | "map.markCategory.viewpoint"
  | "map.markCategory.restaurant"
  | "map.markCategory.cafe"
  | "map.markCategory.question"
  | "map.markCategory.general"
  | "map.markCategoryLabel"
  | "map.markRoomCard.heading"
  | "map.markRoomCard.placeCanton"
  | "map.markRoomCard.placeRegion"
  | "map.markRoomCard.placeRegionCountry"
  | "map.markOpenMap"
  | "map.markUnavailable"
  | "map.placeSaved"
  | "map.placeAlreadySaved"
  | "map.placeMarked"
  | "map.placeAlreadyMarked"
  | "map.placeActionFailed"
  | "map.selectedLocation"
  | "map.resolvingAddress"
  | "map.closeSavePlace"
  | "map.placesSearchPlaceholder"
  | "map.placesSearchEmpty"
  | "map.placesSearching"
  | "map.placesSearchError"
  | "map.overlapTitle"
  | "map.overlapOpenUser"
  | "map.overlapOpenSpot"
  | "map.overlapUsersCount"
  | "map.overlapSpotsCount"
  | "map.overlapChooseUser"
  | "map.overlapChooseSpot"
  | "map.overlapCombinedLabel"
  | "map.closeOverlap"
  | "map.markClusterTitle"
  | "map.sharePlace.action"
  | "map.sharePlace.title"
  | "map.sharePlace.subtitle"
  | "map.sharePlace.sendToCityRoom"
  | "map.sharePlace.sendToCityRoomDesc"
  | "map.sharePlace.sendInDm"
  | "map.sharePlace.sendInDmDesc"
  | "map.sharePlace.shareExternally"
  | "map.sharePlace.shareExternallyDesc"
  | "map.sharePlace.externalUnavailable"
  | "map.sharePlace.sent"
  | "map.sharePlace.openInSpotDrop"
  | "map.sharePlace.opening"
  | "map.sharePlace.unavailable"
  | "map.sharePlace.signIn"
  | "map.sharePlace.loadingRooms"
  | "map.sharePlace.recentRooms"
  | "map.sharePlace.browseAllRooms"
  | "map.sharePlace.chooseCountry"
  | "map.sharePlace.chooseCity"
  | "map.sharePlace.searchCountries"
  | "map.sharePlace.searchCities"
  | "map.sharePlace.sendToCount"
  | "map.sharePlace.sectionPeople"
  | "map.sharePlace.sectionGroups"
  | "map.sharePlace.error.sendFailed"
  | "map.sharePlace.error.shareFailed"
  | "map.sharePlace.copiedFallback"
  | "map.shareMark.action"
  | "map.shareMark.title"
  | "map.shareMark.subtitle"
  | "map.shareMark.sendToCityRoomDesc"
  | "map.shareMark.sendInDmDesc"
  | "map.shareMark.sent"
  | "map.shareMark.createdBy"
  | "map.shareMark.error.sendFailed"
  | "error.connection"
  | "error.loadUsers"
  | "error.loadFollowers"
  | "error.loadFriends"
  | "error.loadFollowStatus"
  | "error.follow"
  | "error.cannotFollowSelf"
  | "error.unfollow"
  | "error.removeFollower"
  | "error.updateFollowStatus"
  | "error.loadProfileContent";

export type TranslationKey = CoreTranslationKey | ExtensionKey;

type CoreMessageTable = Record<CoreTranslationKey, string>;
type MessageTable = Record<TranslationKey, string>;

const CORE_EN: CoreMessageTable = {
  "nav.spots": "Spots",
  "nav.visit": "Visit",
  "nav.search": "Search",
  "nav.friends": "Following",
  "nav.map": "Map",
  "nav.messages": "Messages",
  "nav.myChats": "My chats",
  "nav.myProfile": "My profile",
  "nav.create": "Create",
  "nav.saveLocation": "Save location",
  "auth.signIn": "Sign in",
  "auth.signOut": "Sign out",
  "common.loading": "Loading…",
  "common.tryAgain": "Try again",
  "common.somethingWentWrong": "Something went wrong. Please try again.",
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.close": "Close",
  "common.back": "Back",
  "profile.myProfile": "My profile",
  "profile.officialProfile": "Official profile",
  "profile.follow": "Follow",
  "profile.unfollow": "Unfollow",
  "profile.message": "Message",
  "profile.friends": "Friends",
  "profile.followers": "Followers",
  "profile.posts": "Posts",
  "profile.spots": "Spots",
  "profile.collections": "Collections",
  "profile.saved": "Saved",
  "profile.mySpots": "My Spots",
  "profile.noSavedSpotsYet": "No saved spots yet",
  "profile.noSavedSpotsYetSubtitle": "Save spots to view them here.",
  "profile.noMySpotsYet": "No Spots here yet",
  "profile.noMySpotsYetSubtitle": "Spots you publish to My Spots appear here.",
  "profile.channels": "Channels",
  "profile.viewProfile": "View profile",
  "profile.openMyProfile": "Open my profile",
  "profile.editProfile": "Edit profile",
  "profile.shareProfile": "Share profile",
  "profile.galleryTitle": "Private Profile",
  "profile.gallerySubtitle": "Your photos, videos, and text cards",
  "profile.galleryMediaSubtitle": "Your personal photos and videos",
  "profile.galleryEmpty": "No photos yet.",
  "profile.galleryEmptyHint": "Tap + to add a photo from your library.",
  "profile.galleryStatPhotoOne": "1 photo",
  "profile.galleryStatPhotoMany": "{count} photos",
  "profile.galleryStatVideoOne": "1 video",
  "profile.galleryStatVideoMany": "{count} videos",
  "profile.galleryAdd": "Add to gallery",
  "profile.galleryAddPhoto": "Add photo",
  "profile.galleryPhotosOnlyHint": "Photos only — crop, edit, and add a caption before uploading.",
  "profile.galleryUploading": "Uploading…",
  "profile.galleryUploadFailed": "Unable to save gallery photo.",
  "profile.galleryEditor.crop": "Crop",
  "profile.galleryEditor.effects": "Effects",
  "profile.galleryEditor.caption": "Caption",
  "profile.galleryEditor.captionLabel": "Write a caption",
  "profile.galleryEditor.next": "Next",
  "profile.galleryEditor.upload": "Upload",
  "profile.galleryEditor.reset": "Reset",
  "profile.galleryEditor.rotate": "Rotate",
  "profile.galleryEditor.zoomIn": "Zoom in",
  "profile.galleryEditor.zoomOut": "Zoom out",
  "profile.galleryEditor.ratioSquare": "1:1",
  "profile.galleryEditor.ratioPortrait": "4:5",
  "profile.galleryEditor.ratioOriginal": "Original",
  "profile.galleryEditor.effect.original": "Original",
  "profile.galleryEditor.effect.brightness": "Brightness",
  "profile.galleryEditor.effect.contrast": "Contrast",
  "profile.galleryEditor.effect.saturation": "Saturation",
  "profile.galleryEditor.effect.warmth": "Warmth",
  "profile.galleryEditor.effect.fade": "Fade",
  "profile.galleryEditor.effect.blackWhite": "B&W",
  "profile.galleryOpenPhoto": "Open photo",
  "profile.galleryOpenVideo": "Open video",
  "profile.galleryPhotoLabel": "Photo",
  "profile.galleryVideoLabel": "Video",
  "profile.galleryPrevious": "Previous",
  "profile.galleryNext": "Next",
  "profile.galleryUnavailable": "Media unavailable.",
  "profile.galleryActions": "Gallery actions",
  "profile.galleryLabel": "Private Profile",
  "profile.galleryTitleUser": "{user}'s Gallery",
  "profile.galleryFriendsOnly": "This Profile Gallery is available to friends only.",
  "profile.galleryPrivate": "This gallery is private.",
  "profile.galleryItemActions": "Gallery item",
  "profile.galleryAddDescription": "Add description",
  "profile.galleryEditDescription": "Edit description",
  "profile.galleryDescriptionPlaceholder": "Write a description…",
  "profile.gallerySaveDescription": "Save",
  "profile.galleryDeleteConfirmTitle": "Delete from gallery?",
  "profile.galleryDeleteConfirmBody": "Delete this from your gallery?",
  "profile.galleryDescriptionSaved": "Description saved.",
  "profile.galleryDeleted": "Removed from your gallery.",
  "profile.galleryVisibility.sectionTitle": "Profile Gallery Visibility",
  "profile.galleryVisibility.everyone": "Everyone",
  "profile.galleryVisibility.followers": "Followers",
  "profile.galleryVisibility.friends": "Friends",
  "profile.galleryVisibility.selected": "Selected people",
  "profile.openGallery": "Open profile gallery",
  "channels.new": "New Channel",
  "channels.create": "Create channel",
  "channels.creating": "Creating…",
  "channels.namePlaceholder": "Channel name",
  "channels.descriptionPlaceholder": "Description (optional)",
  "channels.emptyTitle": "No channels yet",
  "channels.emptyOwner": "Create channels to curate Spots, photos, videos, and text cards.",
  "channels.emptyViewer": "This user has not shared any channels.",
  "channels.emptyItems": "This channel is empty.",
  "channels.invalid": "Channel not found.",
  "channels.itemCountOne": "1 item",
  "channels.itemCountMany": "{count} items",
  "channels.visibility.public": "Public",
  "channels.visibility.private": "Personal",
  "menu.channels": "Channels",
  "menu.channelsDesc": "Your curated channels",
  "profile.noPostsYet": "No posts yet",
  "profile.noPostsYetSubtitle": "Your published posts will appear here.",
  "profile.noPublicSpotsYet": "No public spots yet",
  "profile.loading": "Loading profile…",
  "profile.updating": "Updating…",
  "profile.updatedSuccess": "Profile updated successfully.",
  "profile.storyShared": "Story shared.",
  "profile.loadTimeout": "Profile is taking too long to load. Please try again.",
  "profile.sessionTimeout": "Profile session is taking too long to load. Please try again.",
  "profile.dataTimeout": "Profile data is taking too long to load. Please try again.",
  "profile.postsTimeout": "Profile posts are taking too long to load. Showing profile without posts.",
  "profile.completeFirst": "Complete your profile first.",
  "profile.unableToLoad": "Unable to load your profile.",
  "profile.connectionsPartialLoad": "Some profile details could not load. Your profile is still available.",
  "profile.postsPartialLoad": "Your posts and spots could not load. Tap try again below.",
  "profile.noFollowersYet": "No followers yet.",
  "profile.noFriendsYet": "No friends yet.",
  "profile.followsYou": "Follows you",
  "profile.removeFollower": "Remove follower",
  "profile.removeFollowerConfirmTitle": "Remove follower?",
  "profile.removeFollowerConfirmBody": "Remove {user} from your followers? They will not be blocked and you will not unfollow them.",
  "profile.mutualFollow": "Mutual follow",
  "profile.notSignedIn": "You are not signed in.",
  "profile.signInPrompt": "Sign in to access your profile and join city chat rooms.",
  "profile.loginNow": "Sign in",
  "profile.signInToUpload": "Please sign in to upload files.",
  "profile.unableToSavePhoto": "Unable to save your profile photo.",
  "profile.unableToUploadPhoto": "Unable to upload profile photo.",
  "profile.userNotFound": "User not found.",
  "profile.backToSearch": "Back to search",
  "profile.openProfileMenu": "Open profile menu",
  "profile.changePhoto": "Change profile photo",
  "profile.addStory": "Add story",
  "profile.spotFallback": "Spot",
  "menu.title": "Profile menu",
  "menu.settings": "Settings",
  "menu.settingsDesc": "Account, privacy, notifications",
  "menu.collections": "Saved / collections",
  "menu.collectionsDesc": "Your saved spots and collections",
  "menu.help": "Help",
  "menu.helpDesc": "Contact support or browse guides",
  "menu.signOutDesc": "End session on this device",
  "share.title": "Share profile",
  "share.copied": "Copied",
  "share.copyLink": "Copy link",
  "share.downloadQr": "Download QR",
  "share.share": "Share",
  "share.qrUnavailable": "QR unavailable",
  "share.errorQr": "Unable to generate QR code.",
  "share.errorCopy": "Unable to copy link.",
  "share.errorShare": "Unable to share right now.",
  "share.nativeTitle": "{handle} on SpotDrop",
  "share.nativeText": "View {handle} on SpotDrop",
  "collections.new": "New collection",
  "collections.cancel": "Cancel",
  "collections.namePlaceholder": "e.g. Best lakes Switzerland",
  "collections.descriptionPlaceholder": "Description (optional)",
  "collections.create": "Create collection",
  "collections.creating": "Creating…",
  "collections.emptyTitle": "No saved spots yet",
  "collections.emptyOwner": "Save spots to organize and view them here.",
  "collections.emptyViewer": "No saved spots to show yet.",
  "collections.spotCountOne": "1 spot",
  "collections.spotCountMany": "{count} spots",
  "collections.visibility.public": "Public",
  "collections.visibility.friends": "Friends only",
  "collections.visibility.invite": "Invite only",
  "collections.visibility.private": "Private",
  "content.delete": "Delete",
  "content.deleteSpot": "Delete Spot",
  "content.deleteTitle": "Delete this permanently?",
  "content.deleteBody": "This cannot be undone. Your photo, video, or story will be removed.",
  "content.deleteSpotTitle": "Delete this Spot?",
  "content.deleteSpotBody": "This cannot be undone.",
  "content.editPublication": "Edit publication",
  "content.deletePublication": "Delete publication",
  "content.deletePublicationTitle": "Delete this publication?",
  "content.deletePublicationBody": "This action cannot be undone.",
  "content.publicationActions": "Publication actions",
  "content.saveChanges": "Save changes",
  "content.savingChanges": "Saving…",
  "content.editCaptionLabel": "Caption",
  "content.editCaptionPlaceholder": "Write a caption…",
  "content.unableToSaveEdit": "Unable to save changes.",
  "content.spotDeleted": "Spot deleted",
  "content.unableToDelete": "Unable to delete.",
  "map.loading": "Loading map…",
  "map.onlineNearby": "{count} online nearby",
  "map.nobodyOnline": "No one online nearby",
  "map.becomeOnline": "Become online",
  "map.hideFromMap": "Hide from map",
  "map.connecting": "Connecting…",
  "map.visibleOnMap": "You are visible on the map",
  "map.hiddenFromMap": "You are hidden from the map",
  "map.allowLocationAccess": "Allow location access to appear on the map",
  "map.couldNotGetLocation": "Could not get your location",
  "map.couldNotLoadMap": "Map could not be loaded",
  "map.error.notLoggedIn": "Please sign in to use the map",
  "map.error.permissionDenied": "Location permission denied",
  "map.error.geolocationUnsupported": "Geolocation is not supported on this device",
  "map.error.saveFailed": "Could not save your location",
  "map.error.tableMissing": "Live map is not set up yet. Run the user_live_locations migration in Supabase.",
  "map.error.invalidCoords": "Could not read a valid GPS location.",
  "map.hiddenSuccess": "You are hidden from the map",
  "map.error.loadFailed": "Could not load live users",
  "map.openInMaps": "Open in Maps",
  "map.userOnline": "Online now",
  "map.you": "You",
  "map.centerLocation": "Center on my location",
  "map.zoomIn": "Zoom in",
  "map.zoomOut": "Zoom out",
  "map.myLocation": "My location",
  "map.mapCenter": "Map center",
  "map.mapLabel": "Map",
  "map.userIsLive": "{username} is live",
  "map.closeProfileCard": "Close profile card",
  "map.closeSpotDetails": "Close spot details",
  "map.noPreview": "No preview",
  "map.locationAvailable": "Location available",
  "map.openSpot": "Open spot",
  "map.saveThisPlace": "Save this place?",
  "map.createTextCard": "Create Text Card",
  "map.viewSpot": "View Spot",
  "map.seeSpot": "See Spot",
  "map.placeActionsTitle": "This place",
  "map.actionSavePlace": "Save this place",
  "map.actionGoToPlace": "Go to this place",
  "map.actionMarkPlace": "Mark this place",
  "map.markTextPlaceholder": "What is happening here?",
  "map.markTextRequired": "Write a short note for this mark.",
  "map.markAddPhotoCamera": "Take photo",
  "map.markAddPhotoGallery": "Gallery",
  "map.markRetakePhoto": "Retake",
  "map.markRemovePhoto": "Remove",
  "map.markDiscardConfirm": "Discard this mark?",
  "map.markPublish": "Publish",
  "map.markEdit": "Edit",
  "map.markOpenInGoogleMaps": "Open in Google Maps",
  "map.markPublished": "Mark published on the map",
  "map.markCategory.traffic": "Traffic",
  "map.markCategory.roadClosed": "Road closed",
  "map.markCategory.police": "Police",
  "map.markCategory.parking": "Parking",
  "map.markCategory.danger": "Danger",
  "map.markCategory.event": "Event",
  "map.markCategory.viewpoint": "Viewpoint",
  "map.markCategory.restaurant": "Restaurant",
  "map.markCategory.cafe": "Cafe",
  "map.markCategory.question": "Question",
  "map.markCategory.general": "General",
  "map.markCategoryLabel": "Category",
  "map.markRoomCard.heading": "marked a place on the map",
  "map.markRoomCard.placeCanton": "{place} · {canton}",
  "map.markRoomCard.placeRegion": "{place} · {region}",
  "map.markRoomCard.placeRegionCountry": "{place} · {region}, {country}",
  "map.markOpenMap": "Open Map",
  "map.markUnavailable": "This map update is no longer available",
  "map.placeSaved": "Place saved",
  "map.placeAlreadySaved": "Place already saved",
  "map.placeMarked": "Place marked on map",
  "map.placeAlreadyMarked": "Place already marked",
  "map.placeActionFailed": "Could not update this place",
  "map.selectedLocation": "Selected location",
  "map.resolvingAddress": "Looking up address…",
  "map.closeSavePlace": "Close place actions",
  "map.placesSearchPlaceholder": "Search city, address or place...",
  "map.placesSearchEmpty": "No places found.",
  "map.placesSearching": "Searching…",
  "map.placesSearchError": "Place search is unavailable.",
  "map.overlapTitle": "What's here",
  "map.overlapOpenUser": "Open user",
  "map.overlapOpenSpot": "Open Spot",
  "map.overlapUsersCount": "{count} users",
  "map.overlapSpotsCount": "{count} Spots",
  "map.overlapChooseUser": "Choose a user",
  "map.overlapChooseSpot": "Choose a Spot",
  "map.overlapCombinedLabel": "Live user and Spot",
  "map.closeOverlap": "Close",
  "map.markClusterTitle": "{count} Marks here",
  "map.sharePlace.action": "Share this place",
  "map.sharePlace.title": "Share this place",
  "map.sharePlace.subtitle": "Send a clickable place card",
  "map.sharePlace.sendToCityRoom": "Send to City Room",
  "map.sharePlace.sendToCityRoomDesc": "Share into any city room as a clickable place card",
  "map.sharePlace.sendInDm": "Send in DM",
  "map.sharePlace.sendInDmDesc": "Send to one or more people in Direct Messages",
  "map.sharePlace.shareExternally": "Share externally",
  "map.sharePlace.shareExternallyDesc": "Share via WhatsApp, Telegram, Messages, Mail, and more",
  "map.sharePlace.externalUnavailable": "External sharing is not available on this device.",
  "map.sharePlace.sent": "Place shared",
  "map.sharePlace.openInSpotDrop": "Open in SpotDrop",
  "map.sharePlace.opening": "Opening…",
  "map.sharePlace.unavailable": "This place is no longer available.",
  "map.sharePlace.signIn": "Sign in to share places.",
  "map.sharePlace.loadingRooms": "Loading city rooms…",
  "map.sharePlace.recentRooms": "Recent rooms",
  "map.sharePlace.browseAllRooms": "Browse all city rooms",
  "map.sharePlace.chooseCountry": "Choose a country",
  "map.sharePlace.chooseCity": "Choose a city",
  "map.sharePlace.searchCountries": "Search countries…",
  "map.sharePlace.searchCities": "Search cities…",
  "map.sharePlace.sendToCount": "Send to {count}",
  "map.sharePlace.sectionPeople": "People",
  "map.sharePlace.sectionGroups": "Groups",
  "map.sharePlace.error.sendFailed": "Unable to share this place.",
  "map.sharePlace.error.shareFailed": "Unable to open the share sheet.",
  "map.sharePlace.copiedFallback": "Share sheet unavailable — copied place details to clipboard",
  "map.shareMark.action": "Share",
  "map.shareMark.title": "Share Mark",
  "map.shareMark.subtitle": "Send a clickable Mark card",
  "map.shareMark.sendToCityRoomDesc": "Share into any city room as a clickable Mark card",
  "map.shareMark.sendInDmDesc": "Send to one or more people or group chats",
  "map.shareMark.sent": "Mark shared",
  "map.shareMark.createdBy": "Created by @{username}",
  "map.shareMark.error.sendFailed": "Unable to share this Mark.",
  "error.connection": "Connection problem. Please try again.",
  "error.loadUsers": "Unable to load users.",
  "error.loadFollowers": "Unable to load followers.",
  "error.loadFriends": "Unable to load friends.",
  "error.loadFollowStatus": "Unable to load follow status.",
  "error.follow": "Unable to follow this user.",
  "error.cannotFollowSelf": "You cannot follow yourself.",
  "error.unfollow": "Unable to unfollow this user.",
  "error.removeFollower": "Unable to remove this follower.",
  "error.updateFollowStatus": "Unable to update follow status.",
  "error.loadProfileContent": "Unable to load profile content.",
};

const EN: MessageTable = { ...CORE_EN, ...EXTENSION_EN };

const CORE_RU: CoreMessageTable = {
  "nav.spots": "Места",
  "nav.visit": "Комнаты",
  "nav.search": "Поиск",
  "nav.friends": "Подписки",
  "nav.map": "Карта",
  "nav.messages": "Сообщения",
  "nav.myChats": "Мои чаты",
  "nav.myProfile": "Мой профиль",
  "nav.create": "Создать",
  "nav.saveLocation": "Сохранить место",
  "auth.signIn": "Войти",
  "auth.signOut": "Выйти",
  "common.loading": "Загрузка…",
  "common.tryAgain": "Повторить",
  "common.somethingWentWrong": "Что-то пошло не так. Попробуйте ещё раз.",
  "common.cancel": "Отмена",
  "common.delete": "Удалить",
  "common.close": "Закрыть",
  "common.back": "Назад",
  "profile.myProfile": "Мой профиль",
  "profile.officialProfile": "Официальный профиль",
  "profile.follow": "Подписаться",
  "profile.unfollow": "Отписаться",
  "profile.message": "Написать",
  "profile.friends": "Друзья",
  "profile.followers": "Подписчики",
  "profile.posts": "Посты",
  "profile.spots": "Места",
  "profile.collections": "Коллекции",
  "profile.saved": "Сохранённое",
  "profile.mySpots": "Мои места",
  "profile.noSavedSpotsYet": "Пока нет сохранённых мест",
  "profile.noSavedSpotsYetSubtitle": "Сохраняйте места, чтобы видеть их здесь.",
  "profile.noMySpotsYet": "Здесь пока нет спотов",
  "profile.noMySpotsYetSubtitle": "Споты, опубликованные в «Мои места», появятся здесь.",
  "profile.channels": "Каналы",
  "profile.viewProfile": "Открыть профиль",
  "profile.openMyProfile": "Мой профиль",
  "profile.editProfile": "Редактировать",
  "profile.shareProfile": "Поделиться",
  "profile.galleryTitle": "Личный профиль",
  "profile.gallerySubtitle": "Ваши фото, видео и текстовые карточки",
  "profile.galleryMediaSubtitle": "Ваши личные фото и видео",
  "profile.galleryEmpty": "Пока нет фото.",
  "profile.galleryEmptyHint": "Нажмите +, чтобы добавить фото из библиотеки.",
  "profile.galleryStatPhotoOne": "1 фото",
  "profile.galleryStatPhotoMany": "{count} фото",
  "profile.galleryStatVideoOne": "1 видео",
  "profile.galleryStatVideoMany": "{count} видео",
  "profile.galleryAdd": "Добавить в галерею",
  "profile.galleryAddPhoto": "Добавить фото",
  "profile.galleryPhotosOnlyHint": "Только фото — обрежьте, отредактируйте и добавьте подпись перед загрузкой.",
  "profile.galleryUploading": "Загрузка…",
  "profile.galleryUploadFailed": "Не удалось сохранить фото.",
  "profile.galleryEditor.crop": "Обрезка",
  "profile.galleryEditor.effects": "Эффекты",
  "profile.galleryEditor.caption": "Подпись",
  "profile.galleryEditor.captionLabel": "Напишите подпись",
  "profile.galleryEditor.next": "Далее",
  "profile.galleryEditor.upload": "Загрузить",
  "profile.galleryEditor.reset": "Сброс",
  "profile.galleryEditor.rotate": "Повернуть",
  "profile.galleryEditor.zoomIn": "Увеличить",
  "profile.galleryEditor.zoomOut": "Уменьшить",
  "profile.galleryEditor.ratioSquare": "1:1",
  "profile.galleryEditor.ratioPortrait": "4:5",
  "profile.galleryEditor.ratioOriginal": "Оригинал",
  "profile.galleryEditor.effect.original": "Оригинал",
  "profile.galleryEditor.effect.brightness": "Яркость",
  "profile.galleryEditor.effect.contrast": "Контраст",
  "profile.galleryEditor.effect.saturation": "Насыщенность",
  "profile.galleryEditor.effect.warmth": "Теплота",
  "profile.galleryEditor.effect.fade": "Выцветание",
  "profile.galleryEditor.effect.blackWhite": "Ч/Б",
  "profile.galleryOpenPhoto": "Открыть фото",
  "profile.galleryOpenVideo": "Открыть видео",
  "profile.galleryPhotoLabel": "Фото",
  "profile.galleryVideoLabel": "Видео",
  "profile.galleryPrevious": "Назад",
  "profile.galleryNext": "Далее",
  "profile.galleryUnavailable": "Медиа недоступно.",
  "profile.galleryActions": "Действия галереи",
  "profile.galleryLabel": "Личный профиль",
  "profile.galleryTitleUser": "Галерея {user}",
  "profile.galleryFriendsOnly": "Эта галерея профиля доступна только друзьям.",
  "profile.galleryPrivate": "Эта галерея профиля закрыта.",
  "profile.galleryItemActions": "Элемент галереи",
  "profile.galleryAddDescription": "Добавить описание",
  "profile.galleryEditDescription": "Изменить описание",
  "profile.galleryDescriptionPlaceholder": "Напишите описание…",
  "profile.gallerySaveDescription": "Сохранить",
  "profile.galleryDeleteConfirmTitle": "Удалить из галереи?",
  "profile.galleryDeleteConfirmBody": "Удалить это из вашей галереи?",
  "profile.galleryDescriptionSaved": "Описание сохранено.",
  "profile.galleryDeleted": "Удалено из галереи.",
  "profile.galleryVisibility.sectionTitle": "Видимость галереи профиля",
  "profile.galleryVisibility.everyone": "Все",
  "profile.galleryVisibility.followers": "Подписчики",
  "profile.galleryVisibility.friends": "Друзья",
  "profile.galleryVisibility.selected": "Выбранные люди",
  "profile.openGallery": "Открыть галерею профиля",
  "channels.new": "Новый канал",
  "channels.create": "Создать канал",
  "channels.creating": "Создание…",
  "channels.namePlaceholder": "Название канала",
  "channels.descriptionPlaceholder": "Описание (необязательно)",
  "channels.emptyTitle": "Пока нет каналов",
  "channels.emptyOwner": "Создавайте каналы для подборок Spots, фото, видео и текстовых карточек.",
  "channels.emptyViewer": "Этот пользователь не поделился каналами.",
  "channels.emptyItems": "В этом канале пока пусто.",
  "channels.invalid": "Канал не найден.",
  "channels.itemCountOne": "1 элемент",
  "channels.itemCountMany": "{count} элементов",
  "channels.visibility.public": "Публичный",
  "channels.visibility.private": "Личный",
  "menu.channels": "Каналы",
  "menu.channelsDesc": "Ваши тематические каналы",
  "profile.noPostsYet": "Пока нет постов",
  "profile.noPostsYetSubtitle": "Ваши опубликованные посты появятся здесь.",
  "profile.noPublicSpotsYet": "Пока нет публичных мест",
  "profile.loading": "Загрузка профиля…",
  "profile.updating": "Обновление…",
  "profile.updatedSuccess": "Профиль успешно обновлён.",
  "profile.storyShared": "История опубликована.",
  "profile.loadTimeout": "Профиль слишком долго загружается. Попробуйте ещё раз.",
  "profile.sessionTimeout": "Сессия слишком долго загружается. Попробуйте ещё раз.",
  "profile.dataTimeout": "Данные профиля слишком долго загружаются. Попробуйте ещё раз.",
  "profile.postsTimeout": "Посты слишком долго загружаются. Показываем профиль без постов.",
  "profile.completeFirst": "Сначала заполните профиль.",
  "profile.unableToLoad": "Не удалось загрузить профиль.",
  "profile.connectionsPartialLoad": "Часть данных профиля не загрузилась. Профиль всё ещё доступен.",
  "profile.postsPartialLoad": "Не удалось загрузить посты и места. Нажмите «Повторить» ниже.",
  "profile.noFollowersYet": "Пока нет подписчиков.",
  "profile.noFriendsYet": "Пока нет друзей.",
  "profile.followsYou": "Подписан на вас",
  "profile.removeFollower": "Удалить подписчика",
  "profile.removeFollowerConfirmTitle": "Удалить подписчика?",
  "profile.removeFollowerConfirmBody": "Удалить {user} из ваших подписчиков? Пользователь не будет заблокирован, и вы не отпишетесь от него.",
  "profile.mutualFollow": "Взаимная подписка",
  "profile.notSignedIn": "Вы не вошли в аккаунт.",
  "profile.signInPrompt": "Войдите, чтобы открыть профиль и присоединиться к городским чатам.",
  "profile.loginNow": "Войти",
  "profile.signInToUpload": "Войдите, чтобы загрузить файлы.",
  "profile.unableToSavePhoto": "Не удалось сохранить фото профиля.",
  "profile.unableToUploadPhoto": "Не удалось загрузить фото профиля.",
  "profile.userNotFound": "Пользователь не найден.",
  "profile.backToSearch": "Назад к поиску",
  "profile.openProfileMenu": "Открыть меню профиля",
  "profile.changePhoto": "Изменить фото профиля",
  "profile.addStory": "Добавить историю",
  "profile.spotFallback": "Место",
  "menu.title": "Меню профиля",
  "menu.settings": "Настройки",
  "menu.settingsDesc": "Аккаунт, приватность, уведомления",
  "menu.collections": "Сохранённое / коллекции",
  "menu.collectionsDesc": "Ваши сохранённые места и коллекции",
  "menu.help": "Помощь",
  "menu.helpDesc": "Связаться с поддержкой или открыть справку",
  "menu.signOutDesc": "Завершить сессию на этом устройстве",
  "share.title": "Поделиться профилем",
  "share.copied": "Скопировано",
  "share.copyLink": "Копировать ссылку",
  "share.downloadQr": "Скачать QR",
  "share.share": "Поделиться",
  "share.qrUnavailable": "QR недоступен",
  "share.errorQr": "Не удалось создать QR-код.",
  "share.errorCopy": "Не удалось скопировать ссылку.",
  "share.errorShare": "Не удалось поделиться.",
  "share.nativeTitle": "{handle} в SpotDrop",
  "share.nativeText": "Смотреть {handle} в SpotDrop",
  "collections.new": "Новая коллекция",
  "collections.cancel": "Отмена",
  "collections.namePlaceholder": "например, Лучшие озёра Швейцарии",
  "collections.descriptionPlaceholder": "Описание (необязательно)",
  "collections.create": "Создать коллекцию",
  "collections.creating": "Создание…",
  "collections.emptyTitle": "Пока нет сохранённых мест",
  "collections.emptyOwner": "Сохраняйте места, чтобы организовать и просматривать их здесь.",
  "collections.emptyViewer": "Пока нет сохранённых мест.",
  "collections.spotCountOne": "1 место",
  "collections.spotCountMany": "{count} мест",
  "collections.visibility.public": "Публичная",
  "collections.visibility.friends": "Только друзья",
  "collections.visibility.invite": "По приглашению",
  "collections.visibility.private": "Приватная",
  "content.delete": "Удалить",
  "content.deleteSpot": "Удалить Spot",
  "content.deleteTitle": "Удалить навсегда?",
  "content.deleteBody": "Это нельзя отменить. Фото, видео или история будут удалены.",
  "content.deleteSpotTitle": "Удалить этот Spot?",
  "content.deleteSpotBody": "Это нельзя отменить.",
  "content.editPublication": "Редактировать публикацию",
  "content.deletePublication": "Удалить публикацию",
  "content.deletePublicationTitle": "Удалить эту публикацию?",
  "content.deletePublicationBody": "Это действие нельзя отменить.",
  "content.publicationActions": "Действия с публикацией",
  "content.saveChanges": "Сохранить",
  "content.savingChanges": "Сохранение…",
  "content.editCaptionLabel": "Подпись",
  "content.editCaptionPlaceholder": "Напишите подпись…",
  "content.unableToSaveEdit": "Не удалось сохранить изменения.",
  "content.spotDeleted": "Spot удалён",
  "content.unableToDelete": "Не удалось удалить.",
  "map.loading": "Загрузка карты…",
  "map.onlineNearby": "{count} онлайн рядом",
  "map.nobodyOnline": "Никого нет онлайн",
  "map.becomeOnline": "Стать онлайн",
  "map.hideFromMap": "Скрыться с карты",
  "map.connecting": "Подключение…",
  "map.visibleOnMap": "Вы видны на карте",
  "map.hiddenFromMap": "Вы скрыты с карты",
  "map.allowLocationAccess": "Разрешите доступ к геолокации, чтобы появиться на карте",
  "map.couldNotGetLocation": "Не удалось получить ваше местоположение",
  "map.couldNotLoadMap": "Не удалось загрузить карту",
  "map.error.notLoggedIn": "Войдите, чтобы использовать карту",
  "map.error.permissionDenied": "Доступ к геолокации запрещён",
  "map.error.geolocationUnsupported": "Геолокация не поддерживается на этом устройстве",
  "map.error.saveFailed": "Не удалось сохранить местоположение",
  "map.error.tableMissing": "Карта онлайн ещё не настроена. Запустите миграцию user_live_locations в Supabase.",
  "map.error.invalidCoords": "Не удалось получить корректные GPS-координаты.",
  "map.hiddenSuccess": "Вы скрыты с карты",
  "map.error.loadFailed": "Не удалось загрузить пользователей на карте",
  "map.openInMaps": "Открыть в Картах",
  "map.userOnline": "Онлайн",
  "map.you": "Вы",
  "map.centerLocation": "Центрировать на моём местоположении",
  "map.zoomIn": "Приблизить",
  "map.zoomOut": "Отдалить",
  "map.myLocation": "Моё местоположение",
  "map.mapCenter": "Центр карты",
  "map.mapLabel": "Карта",
  "map.userIsLive": "{username} в эфире",
  "map.closeProfileCard": "Закрыть карточку профиля",
  "map.closeSpotDetails": "Закрыть детали места",
  "map.noPreview": "Нет превью",
  "map.locationAvailable": "Местоположение доступно",
  "map.openSpot": "Открыть место",
  "map.saveThisPlace": "Сохранить это место?",
  "map.createTextCard": "Создать текстовую карточку",
  "map.viewSpot": "Открыть Spot",
  "map.seeSpot": "Смотреть Spot",
  "map.placeActionsTitle": "Это место",
  "map.actionSavePlace": "Сохранить это место",
  "map.actionGoToPlace": "Проложить маршрут",
  "map.actionMarkPlace": "Отметить это место",
  "map.markTextPlaceholder": "Что здесь происходит?",
  "map.markTextRequired": "Напишите короткую заметку для метки.",
  "map.markAddPhotoCamera": "Сделать фото",
  "map.markAddPhotoGallery": "Галерея",
  "map.markRetakePhoto": "Переснять",
  "map.markRemovePhoto": "Удалить",
  "map.markDiscardConfirm": "Отменить эту метку?",
  "map.markPublish": "Опубликовать",
  "map.markEdit": "Изменить",
  "map.markOpenInGoogleMaps": "Открыть в Google Maps",
  "map.markPublished": "Метка опубликована на карте",
  "map.markCategory.traffic": "Трафик",
  "map.markCategory.roadClosed": "Дорога закрыта",
  "map.markCategory.police": "Полиция",
  "map.markCategory.parking": "Парковка",
  "map.markCategory.danger": "Опасность",
  "map.markCategory.event": "Событие",
  "map.markCategory.viewpoint": "Смотровая",
  "map.markCategory.restaurant": "Ресторан",
  "map.markCategory.cafe": "Кафе",
  "map.markCategory.question": "Вопрос",
  "map.markCategory.general": "Общее",
  "map.markCategoryLabel": "Категория",
  "map.markRoomCard.heading": "отметил место на карте",
  "map.markRoomCard.placeCanton": "{place} · {canton}",
  "map.markRoomCard.placeRegion": "{place} · {region}",
  "map.markRoomCard.placeRegionCountry": "{place} · {region}, {country}",
  "map.markOpenMap": "Открыть карту",
  "map.markUnavailable": "Это обновление карты больше недоступно",
  "map.placeSaved": "Место сохранено",
  "map.placeAlreadySaved": "Место уже сохранено",
  "map.placeMarked": "Место отмечено на карте",
  "map.placeAlreadyMarked": "Место уже отмечено",
  "map.placeActionFailed": "Не удалось обновить это место",
  "map.selectedLocation": "Выбранное место",
  "map.resolvingAddress": "Определение адреса…",
  "map.closeSavePlace": "Закрыть действия с местом",
  "map.placesSearchPlaceholder": "Город, адрес или место…",
  "map.placesSearchEmpty": "Места не найдены.",
  "map.placesSearching": "Поиск…",
  "map.placesSearchError": "Поиск мест недоступен.",
  "map.overlapTitle": "Что здесь",
  "map.overlapOpenUser": "Открыть пользователя",
  "map.overlapOpenSpot": "Открыть Spot",
  "map.overlapUsersCount": "{count} пользователей",
  "map.overlapSpotsCount": "{count} Spot",
  "map.overlapChooseUser": "Выберите пользователя",
  "map.overlapChooseSpot": "Выберите Spot",
  "map.overlapCombinedLabel": "Онлайн-пользователь и Spot",
  "map.closeOverlap": "Закрыть",
  "map.markClusterTitle": "{count} меток здесь",
  "map.sharePlace.action": "Поделиться местом",
  "map.sharePlace.title": "Поделиться местом",
  "map.sharePlace.subtitle": "Отправить карточку места",
  "map.sharePlace.sendToCityRoom": "Отправить в City Room",
  "map.sharePlace.sendToCityRoomDesc": "Поделиться в любом городском чате как карточкой места",
  "map.sharePlace.sendInDm": "Отправить в личные сообщения",
  "map.sharePlace.sendInDmDesc": "Отправить одному или нескольким людям в Direct Messages",
  "map.sharePlace.shareExternally": "Поделиться вне приложения",
  "map.sharePlace.shareExternallyDesc": "Поделиться через WhatsApp, Telegram, Сообщения, Почту и др.",
  "map.sharePlace.externalUnavailable": "Внешний шаринг недоступен на этом устройстве.",
  "map.sharePlace.sent": "Место отправлено",
  "map.sharePlace.openInSpotDrop": "Открыть в SpotDrop",
  "map.sharePlace.opening": "Открытие…",
  "map.sharePlace.unavailable": "Это место больше недоступно.",
  "map.sharePlace.signIn": "Войдите, чтобы делиться местами.",
  "map.sharePlace.loadingRooms": "Загрузка городских комнат…",
  "map.sharePlace.recentRooms": "Недавние комнаты",
  "map.sharePlace.browseAllRooms": "Просмотреть все городские комнаты",
  "map.sharePlace.chooseCountry": "Выберите страну",
  "map.sharePlace.chooseCity": "Выберите город",
  "map.sharePlace.searchCountries": "Поиск стран…",
  "map.sharePlace.searchCities": "Поиск городов…",
  "map.sharePlace.sendToCount": "Отправить ({count})",
  "map.sharePlace.sectionPeople": "Люди",
  "map.sharePlace.sectionGroups": "Группы",
  "map.sharePlace.error.sendFailed": "Не удалось поделиться этим местом.",
  "map.sharePlace.error.shareFailed": "Не удалось открыть меню шаринга.",
  "map.sharePlace.copiedFallback": "Меню шаринга недоступно — данные места скопированы в буфер обмена",
  "map.shareMark.action": "Поделиться",
  "map.shareMark.title": "Поделиться меткой",
  "map.shareMark.subtitle": "Отправить карточку метки",
  "map.shareMark.sendToCityRoomDesc": "Поделиться в любом городском чате как карточкой метки",
  "map.shareMark.sendInDmDesc": "Отправить одному или нескольким людям или в группы",
  "map.shareMark.sent": "Метка отправлена",
  "map.shareMark.createdBy": "Автор: @{username}",
  "map.shareMark.error.sendFailed": "Не удалось поделиться этой меткой.",
  "error.connection": "Проблема с подключением. Попробуйте ещё раз.",
  "error.loadUsers": "Не удалось загрузить пользователей.",
  "error.loadFollowers": "Не удалось загрузить подписчиков.",
  "error.loadFriends": "Не удалось загрузить друзей.",
  "error.loadFollowStatus": "Не удалось загрузить статус подписки.",
  "error.follow": "Не удалось подписаться на пользователя.",
  "error.cannotFollowSelf": "Нельзя подписаться на себя.",
  "error.unfollow": "Не удалось отписаться от пользователя.",
  "error.removeFollower": "Не удалось удалить подписчика.",
  "error.updateFollowStatus": "Не удалось обновить статус подписки.",
  "error.loadProfileContent": "Не удалось загрузить контент профиля.",
};

const RU: MessageTable = { ...CORE_RU, ...EXTENSION_RU };

const CORE_DE: CoreMessageTable = {
  "nav.spots": "Spots",
  "nav.visit": "Besuchen",
  "nav.search": "Suche",
  "nav.friends": "Folge ich",
  "nav.map": "Karte",
  "nav.messages": "Nachrichten",
  "nav.myChats": "Meine Chats",
  "nav.myProfile": "Mein Profil",
  "nav.create": "Erstellen",
  "nav.saveLocation": "Ort speichern",
  "auth.signIn": "Anmelden",
  "auth.signOut": "Abmelden",
  "common.loading": "Laden…",
  "common.tryAgain": "Erneut versuchen",
  "common.somethingWentWrong": "Etwas ist schiefgelaufen. Bitte erneut versuchen.",
  "common.cancel": "Abbrechen",
  "common.delete": "Löschen",
  "common.close": "Schließen",
  "common.back": "Zurück",
  "profile.myProfile": "Mein Profil",
  "profile.officialProfile": "Offizielles Profil",
  "profile.follow": "Folgen",
  "profile.unfollow": "Entfolgen",
  "profile.message": "Nachricht",
  "profile.friends": "Freunde",
  "profile.followers": "Follower",
  "profile.posts": "Beiträge",
  "profile.spots": "Spots",
  "profile.collections": "Sammlungen",
  "profile.saved": "Gespeichert",
  "profile.mySpots": "Meine Spots",
  "profile.noSavedSpotsYet": "Noch keine gespeicherten Spots",
  "profile.noSavedSpotsYetSubtitle": "Speichere Spots, um sie hier zu sehen.",
  "profile.noMySpotsYet": "Noch keine Spots hier",
  "profile.noMySpotsYetSubtitle": "Spots, die du in Meine Spots veröffentlichst, erscheinen hier.",
  "profile.channels": "Kanäle",
  "profile.viewProfile": "Profil ansehen",
  "profile.openMyProfile": "Mein Profil öffnen",
  "profile.editProfile": "Profil bearbeiten",
  "profile.shareProfile": "Profil teilen",
  "profile.galleryTitle": "Privates Profil",
  "profile.gallerySubtitle": "Deine Fotos, Videos und Textkarten",
  "profile.galleryMediaSubtitle": "Deine persönlichen Fotos und Videos",
  "profile.galleryEmpty": "Noch keine Fotos.",
  "profile.galleryEmptyHint": "Tippe auf +, um ein Foto aus der Mediathek hinzuzufügen.",
  "profile.galleryStatPhotoOne": "1 Foto",
  "profile.galleryStatPhotoMany": "{count} Fotos",
  "profile.galleryStatVideoOne": "1 Video",
  "profile.galleryStatVideoMany": "{count} Videos",
  "profile.galleryAdd": "Zur Galerie hinzufügen",
  "profile.galleryAddPhoto": "Foto hinzufügen",
  "profile.galleryPhotosOnlyHint": "Nur Fotos — zuschneiden, bearbeiten und eine Bildunterschrift hinzufügen.",
  "profile.galleryUploading": "Wird hochgeladen…",
  "profile.galleryUploadFailed": "Galerie-Foto konnte nicht gespeichert werden.",
  "profile.galleryEditor.crop": "Zuschneiden",
  "profile.galleryEditor.effects": "Effekte",
  "profile.galleryEditor.caption": "Bildunterschrift",
  "profile.galleryEditor.captionLabel": "Bildunterschrift schreiben",
  "profile.galleryEditor.next": "Weiter",
  "profile.galleryEditor.upload": "Hochladen",
  "profile.galleryEditor.reset": "Zurücksetzen",
  "profile.galleryEditor.rotate": "Drehen",
  "profile.galleryEditor.zoomIn": "Vergrößern",
  "profile.galleryEditor.zoomOut": "Verkleinern",
  "profile.galleryEditor.ratioSquare": "1:1",
  "profile.galleryEditor.ratioPortrait": "4:5",
  "profile.galleryEditor.ratioOriginal": "Original",
  "profile.galleryEditor.effect.original": "Original",
  "profile.galleryEditor.effect.brightness": "Helligkeit",
  "profile.galleryEditor.effect.contrast": "Kontrast",
  "profile.galleryEditor.effect.saturation": "Sättigung",
  "profile.galleryEditor.effect.warmth": "Wärme",
  "profile.galleryEditor.effect.fade": "Verblassen",
  "profile.galleryEditor.effect.blackWhite": "S/W",
  "profile.galleryOpenPhoto": "Foto öffnen",
  "profile.galleryOpenVideo": "Video öffnen",
  "profile.galleryPhotoLabel": "Foto",
  "profile.galleryVideoLabel": "Video",
  "profile.galleryPrevious": "Zurück",
  "profile.galleryNext": "Weiter",
  "profile.galleryUnavailable": "Medien nicht verfügbar.",
  "profile.galleryActions": "Galerie-Aktionen",
  "profile.galleryLabel": "Privates Profil",
  "profile.galleryTitleUser": "Galerie von {user}",
  "profile.galleryFriendsOnly": "Diese Profilgalerie ist nur für Freunde verfügbar.",
  "profile.galleryPrivate": "Diese Profilgalerie ist privat.",
  "profile.galleryItemActions": "Galerie-Element",
  "profile.galleryAddDescription": "Beschreibung hinzufügen",
  "profile.galleryEditDescription": "Beschreibung bearbeiten",
  "profile.galleryDescriptionPlaceholder": "Beschreibung schreiben…",
  "profile.gallerySaveDescription": "Speichern",
  "profile.galleryDeleteConfirmTitle": "Aus Galerie löschen?",
  "profile.galleryDeleteConfirmBody": "Dies aus deiner Galerie löschen?",
  "profile.galleryDescriptionSaved": "Beschreibung gespeichert.",
  "profile.galleryDeleted": "Aus der Galerie entfernt.",
  "profile.galleryVisibility.sectionTitle": "Sichtbarkeit der Profilgalerie",
  "profile.galleryVisibility.everyone": "Alle",
  "profile.galleryVisibility.followers": "Follower",
  "profile.galleryVisibility.friends": "Freunde",
  "profile.galleryVisibility.selected": "Ausgewählte Personen",
  "profile.openGallery": "Profilgalerie öffnen",
  "channels.new": "Neuer Kanal",
  "channels.create": "Kanal erstellen",
  "channels.creating": "Wird erstellt…",
  "channels.namePlaceholder": "Kanalname",
  "channels.descriptionPlaceholder": "Beschreibung (optional)",
  "channels.emptyTitle": "Noch keine Kanäle",
  "channels.emptyOwner": "Erstelle Kanäle für Spots, Fotos, Videos und Textkarten.",
  "channels.emptyViewer": "Dieser Nutzer hat keine Kanäle geteilt.",
  "channels.emptyItems": "Dieser Kanal ist leer.",
  "channels.invalid": "Kanal nicht gefunden.",
  "channels.itemCountOne": "1 Eintrag",
  "channels.itemCountMany": "{count} Einträge",
  "channels.visibility.public": "Öffentlich",
  "channels.visibility.private": "Persönlich",
  "menu.channels": "Kanäle",
  "menu.channelsDesc": "Deine kuratierten Kanäle",
  "profile.noPostsYet": "Noch keine Beiträge",
  "profile.noPostsYetSubtitle": "Deine veröffentlichten Beiträge erscheinen hier.",
  "profile.noPublicSpotsYet": "Noch keine öffentlichen Spots",
  "profile.loading": "Profil wird geladen…",
  "profile.updating": "Wird aktualisiert…",
  "profile.updatedSuccess": "Profil erfolgreich aktualisiert.",
  "profile.storyShared": "Story geteilt.",
  "profile.loadTimeout": "Das Profil lädt zu lange. Bitte erneut versuchen.",
  "profile.sessionTimeout": "Die Sitzung lädt zu lange. Bitte erneut versuchen.",
  "profile.dataTimeout": "Profildaten laden zu lange. Bitte erneut versuchen.",
  "profile.postsTimeout": "Beiträge laden zu lange. Profil wird ohne Beiträge angezeigt.",
  "profile.completeFirst": "Bitte vervollständige zuerst dein Profil.",
  "profile.unableToLoad": "Profil konnte nicht geladen werden.",
  "profile.connectionsPartialLoad": "Einige Profildetails konnten nicht geladen werden. Dein Profil ist weiterhin verfügbar.",
  "profile.postsPartialLoad": "Beiträge und Spots konnten nicht geladen werden. Tippe unten auf Erneut versuchen.",
  "profile.noFollowersYet": "Noch keine Follower.",
  "profile.noFriendsYet": "Noch keine Freunde.",
  "profile.followsYou": "Folgt dir",
  "profile.removeFollower": "Follower entfernen",
  "profile.removeFollowerConfirmTitle": "Follower entfernen?",
  "profile.removeFollowerConfirmBody": "{user} aus deinen Followern entfernen? Die Person wird nicht blockiert und du entfolgst sie nicht.",
  "profile.mutualFollow": "Gegenseitig",
  "profile.notSignedIn": "Du bist nicht angemeldet.",
  "profile.signInPrompt": "Melde dich an, um dein Profil zu öffnen und Stadt-Chats beizutreten.",
  "profile.loginNow": "Anmelden",
  "profile.signInToUpload": "Bitte melde dich an, um Dateien hochzuladen.",
  "profile.unableToSavePhoto": "Profilfoto konnte nicht gespeichert werden.",
  "profile.unableToUploadPhoto": "Profilfoto konnte nicht hochgeladen werden.",
  "profile.userNotFound": "Benutzer nicht gefunden.",
  "profile.backToSearch": "Zurück zur Suche",
  "profile.openProfileMenu": "Profilmenü öffnen",
  "profile.changePhoto": "Profilfoto ändern",
  "profile.addStory": "Story hinzufügen",
  "profile.spotFallback": "Spot",
  "menu.title": "Profilmenü",
  "menu.settings": "Einstellungen",
  "menu.settingsDesc": "Konto, Datenschutz, Benachrichtigungen",
  "menu.collections": "Gespeichert / Sammlungen",
  "menu.collectionsDesc": "Deine gespeicherten Spots und Sammlungen",
  "menu.help": "Hilfe",
  "menu.helpDesc": "Support kontaktieren oder Hilfe lesen",
  "menu.signOutDesc": "Sitzung auf diesem Gerät beenden",
  "share.title": "Profil teilen",
  "share.copied": "Kopiert",
  "share.copyLink": "Link kopieren",
  "share.downloadQr": "QR herunterladen",
  "share.share": "Teilen",
  "share.qrUnavailable": "QR nicht verfügbar",
  "share.errorQr": "QR-Code konnte nicht erstellt werden.",
  "share.errorCopy": "Link konnte nicht kopiert werden.",
  "share.errorShare": "Teilen ist gerade nicht möglich.",
  "share.nativeTitle": "{handle} auf SpotDrop",
  "share.nativeText": "{handle} auf SpotDrop ansehen",
  "collections.new": "Neue Sammlung",
  "collections.cancel": "Abbrechen",
  "collections.namePlaceholder": "z. B. Beste Seen Schweiz",
  "collections.descriptionPlaceholder": "Beschreibung (optional)",
  "collections.create": "Sammlung erstellen",
  "collections.creating": "Wird erstellt…",
  "collections.emptyTitle": "Noch keine gespeicherten Spots",
  "collections.emptyOwner": "Speichere Spots, um sie hier zu organisieren und anzusehen.",
  "collections.emptyViewer": "Noch keine gespeicherten Spots vorhanden.",
  "collections.spotCountOne": "1 Spot",
  "collections.spotCountMany": "{count} Spots",
  "collections.visibility.public": "Öffentlich",
  "collections.visibility.friends": "Nur Freunde",
  "collections.visibility.invite": "Nur auf Einladung",
  "collections.visibility.private": "Privat",
  "content.delete": "Löschen",
  "content.deleteSpot": "Spot löschen",
  "content.deleteTitle": "Dauerhaft löschen?",
  "content.deleteBody": "Das kann nicht rückgängig gemacht werden. Foto, Video oder Story werden entfernt.",
  "content.deleteSpotTitle": "Diesen Spot löschen?",
  "content.deleteSpotBody": "Das kann nicht rückgängig gemacht werden.",
  "content.editPublication": "Beitrag bearbeiten",
  "content.deletePublication": "Beitrag löschen",
  "content.deletePublicationTitle": "Diesen Beitrag löschen?",
  "content.deletePublicationBody": "Diese Aktion kann nicht rückgängig gemacht werden.",
  "content.publicationActions": "Beitragsaktionen",
  "content.saveChanges": "Änderungen speichern",
  "content.savingChanges": "Wird gespeichert…",
  "content.editCaptionLabel": "Beschreibung",
  "content.editCaptionPlaceholder": "Beschreibung schreiben…",
  "content.unableToSaveEdit": "Änderungen konnten nicht gespeichert werden.",
  "content.spotDeleted": "Spot gelöscht",
  "content.unableToDelete": "Löschen nicht möglich.",
  "map.loading": "Karte wird geladen…",
  "map.onlineNearby": "{count} online in der Nähe",
  "map.nobodyOnline": "Niemand online in der Nähe",
  "map.becomeOnline": "Online werden",
  "map.hideFromMap": "Von Karte ausblenden",
  "map.connecting": "Verbinden…",
  "map.visibleOnMap": "Du bist auf der Karte sichtbar",
  "map.hiddenFromMap": "Du bist auf der Karte ausgeblendet",
  "map.allowLocationAccess": "Standortzugriff erlauben, um auf der Karte zu erscheinen",
  "map.couldNotGetLocation": "Standort konnte nicht ermittelt werden",
  "map.couldNotLoadMap": "Karte konnte nicht geladen werden",
  "map.error.notLoggedIn": "Bitte melde dich an, um die Karte zu nutzen",
  "map.error.permissionDenied": "Standortzugriff verweigert",
  "map.error.geolocationUnsupported": "Geolokalisierung wird auf diesem Gerät nicht unterstützt",
  "map.error.saveFailed": "Standort konnte nicht gespeichert werden",
  "map.error.tableMissing": "Live-Karte ist noch nicht eingerichtet. Führe die user_live_locations-Migration in Supabase aus.",
  "map.error.invalidCoords": "Es konnten keine gültigen GPS-Koordinaten gelesen werden.",
  "map.hiddenSuccess": "Du bist von der Karte ausgeblendet",
  "map.error.loadFailed": "Live-Nutzer konnten nicht geladen werden",
  "map.openInMaps": "In Karten öffnen",
  "map.userOnline": "Jetzt online",
  "map.you": "Du",
  "map.centerLocation": "Auf meinen Standort zentrieren",
  "map.zoomIn": "Hineinzoomen",
  "map.zoomOut": "Herauszoomen",
  "map.myLocation": "Mein Standort",
  "map.mapCenter": "Kartenmitte",
  "map.mapLabel": "Karte",
  "map.userIsLive": "{username} ist live",
  "map.closeProfileCard": "Profilkarte schließen",
  "map.closeSpotDetails": "Spot-Details schließen",
  "map.noPreview": "Keine Vorschau",
  "map.locationAvailable": "Standort verfügbar",
  "map.openSpot": "Spot öffnen",
  "map.saveThisPlace": "Diesen Ort speichern?",
  "map.createTextCard": "Textkarte erstellen",
  "map.viewSpot": "Spot ansehen",
  "map.seeSpot": "Spot ansehen",
  "map.placeActionsTitle": "Dieser Ort",
  "map.actionSavePlace": "Diesen Ort speichern",
  "map.actionGoToPlace": "Zu diesem Ort navigieren",
  "map.actionMarkPlace": "Diesen Ort markieren",
  "map.markTextPlaceholder": "Was passiert hier?",
  "map.markTextRequired": "Schreibe eine kurze Notiz für diese Markierung.",
  "map.markAddPhotoCamera": "Foto aufnehmen",
  "map.markAddPhotoGallery": "Galerie",
  "map.markRetakePhoto": "Neu aufnehmen",
  "map.markRemovePhoto": "Entfernen",
  "map.markDiscardConfirm": "Diese Markierung verwerfen?",
  "map.markPublish": "Veröffentlichen",
  "map.markEdit": "Bearbeiten",
  "map.markOpenInGoogleMaps": "In Google Maps öffnen",
  "map.markPublished": "Markierung auf der Karte veröffentlicht",
  "map.markCategory.traffic": "Verkehr",
  "map.markCategory.roadClosed": "Strasse gesperrt",
  "map.markCategory.police": "Polizei",
  "map.markCategory.parking": "Parken",
  "map.markCategory.danger": "Gefahr",
  "map.markCategory.event": "Event",
  "map.markCategory.viewpoint": "Aussichtspunkt",
  "map.markCategory.restaurant": "Restaurant",
  "map.markCategory.cafe": "Café",
  "map.markCategory.question": "Frage",
  "map.markCategory.general": "Allgemein",
  "map.markCategoryLabel": "Kategorie",
  "map.markRoomCard.heading": "hat einen Ort auf der Karte markiert",
  "map.markRoomCard.placeCanton": "{place} · {canton}",
  "map.markRoomCard.placeRegion": "{place} · {region}",
  "map.markRoomCard.placeRegionCountry": "{place} · {region}, {country}",
  "map.markOpenMap": "Karte öffnen",
  "map.markUnavailable": "Dieses Karten-Update ist nicht mehr verfügbar",
  "map.placeSaved": "Ort gespeichert",
  "map.placeAlreadySaved": "Ort bereits gespeichert",
  "map.placeMarked": "Ort auf der Karte markiert",
  "map.placeAlreadyMarked": "Ort bereits markiert",
  "map.placeActionFailed": "Ort konnte nicht aktualisiert werden",
  "map.selectedLocation": "Ausgewählter Ort",
  "map.resolvingAddress": "Adresse wird ermittelt…",
  "map.closeSavePlace": "Ort-Aktionen schließen",
  "map.placesSearchPlaceholder": "Stadt, Adresse oder Ort suchen…",
  "map.placesSearchEmpty": "Keine Orte gefunden.",
  "map.placesSearching": "Suche…",
  "map.placesSearchError": "Ortssuche ist nicht verfügbar.",
  "map.overlapTitle": "Was ist hier",
  "map.overlapOpenUser": "Benutzer öffnen",
  "map.overlapOpenSpot": "Spot öffnen",
  "map.overlapUsersCount": "{count} Benutzer",
  "map.overlapSpotsCount": "{count} Spots",
  "map.overlapChooseUser": "Benutzer wählen",
  "map.overlapChooseSpot": "Spot wählen",
  "map.overlapCombinedLabel": "Live-Benutzer und Spot",
  "map.closeOverlap": "Schließen",
  "map.markClusterTitle": "{count} Markierungen hier",
  "map.sharePlace.action": "Diesen Ort teilen",
  "map.sharePlace.title": "Diesen Ort teilen",
  "map.sharePlace.subtitle": "Eine klickbare Ortskarte senden",
  "map.sharePlace.sendToCityRoom": "An City Room senden",
  "map.sharePlace.sendToCityRoomDesc": "In einem beliebigen Stadtraum als klickbare Ortskarte teilen",
  "map.sharePlace.sendInDm": "Per DM senden",
  "map.sharePlace.sendInDmDesc": "An eine oder mehrere Personen in Direct Messages senden",
  "map.sharePlace.shareExternally": "Extern teilen",
  "map.sharePlace.shareExternallyDesc": "Über WhatsApp, Telegram, Nachrichten, Mail und mehr teilen",
  "map.sharePlace.externalUnavailable": "Externes Teilen ist auf diesem Gerät nicht verfügbar.",
  "map.sharePlace.sent": "Ort geteilt",
  "map.sharePlace.openInSpotDrop": "In SpotDrop öffnen",
  "map.sharePlace.opening": "Wird geöffnet…",
  "map.sharePlace.unavailable": "Dieser Ort ist nicht mehr verfügbar.",
  "map.sharePlace.signIn": "Melde dich an, um Orte zu teilen.",
  "map.sharePlace.loadingRooms": "Stadträume werden geladen…",
  "map.sharePlace.recentRooms": "Zuletzt geöffnete Räume",
  "map.sharePlace.browseAllRooms": "Alle Stadträume durchsuchen",
  "map.sharePlace.chooseCountry": "Land auswählen",
  "map.sharePlace.chooseCity": "Stadt auswählen",
  "map.sharePlace.searchCountries": "Länder suchen…",
  "map.sharePlace.searchCities": "Städte suchen…",
  "map.sharePlace.sendToCount": "An {count} senden",
  "map.sharePlace.sectionPeople": "Personen",
  "map.sharePlace.sectionGroups": "Gruppen",
  "map.sharePlace.error.sendFailed": "Dieser Ort konnte nicht geteilt werden.",
  "map.sharePlace.error.shareFailed": "Teilen-Dialog konnte nicht geöffnet werden.",
  "map.sharePlace.copiedFallback": "Teilen nicht verfügbar — Ortsdetails wurden in die Zwischenablage kopiert",
  "map.shareMark.action": "Teilen",
  "map.shareMark.title": "Mark teilen",
  "map.shareMark.subtitle": "Eine klickbare Mark-Karte senden",
  "map.shareMark.sendToCityRoomDesc": "In einem beliebigen Stadtraum als klickbare Mark-Karte teilen",
  "map.shareMark.sendInDmDesc": "An eine oder mehrere Personen oder Gruppen senden",
  "map.shareMark.sent": "Mark geteilt",
  "map.shareMark.createdBy": "Erstellt von @{username}",
  "map.shareMark.error.sendFailed": "Diese Mark konnte nicht geteilt werden.",
  "error.connection": "Verbindungsproblem. Bitte erneut versuchen.",
  "error.loadUsers": "Benutzer konnten nicht geladen werden.",
  "error.loadFollowers": "Follower konnten nicht geladen werden.",
  "error.loadFriends": "Freunde konnten nicht geladen werden.",
  "error.loadFollowStatus": "Follow-Status konnte nicht geladen werden.",
  "error.follow": "Diesem Nutzer konnte nicht gefolgt werden.",
  "error.cannotFollowSelf": "Du kannst dir nicht selbst folgen.",
  "error.unfollow": "Entfolgen nicht möglich.",
  "error.removeFollower": "Follower konnte nicht entfernt werden.",
  "error.updateFollowStatus": "Follow-Status konnte nicht aktualisiert werden.",
  "error.loadProfileContent": "Profilinhalt konnte nicht geladen werden.",
};

const DE: MessageTable = { ...CORE_DE, ...EXTENSION_DE };

export const I18N_MESSAGES: Record<I18nLocale, MessageTable> = {
  en: EN,
  ru: RU,
  de: DE,
};

export function translateMessage(
  locale: I18nLocale,
  key: TranslationKey,
  values?: Record<string, string | number>
) {
  let message = I18N_MESSAGES[locale][key] ?? I18N_MESSAGES.en[key] ?? key;

  if (values) {
    for (const [name, value] of Object.entries(values)) {
      message = message.replaceAll(`{${name}}`, String(value));
    }
  }

  return message;
}
