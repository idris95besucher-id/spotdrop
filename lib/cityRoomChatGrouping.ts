export type CityRoomMessageLike = {
  id: string;
  user_id: string;
  created_at: string;
};

const GROUP_GAP_MS = 5 * 60 * 1000;

export function isSameCityRoomMessageGroup(
  previous: CityRoomMessageLike | null | undefined,
  current: CityRoomMessageLike
) {
  if (!previous) {
    return false;
  }

  if (previous.user_id !== current.user_id) {
    return false;
  }

  const gap = Math.abs(new Date(current.created_at).getTime() - new Date(previous.created_at).getTime());

  return gap <= GROUP_GAP_MS;
}

/** Username row at the start of each sender cluster (Telegram group style). */
export function shouldShowCityRoomSenderName(
  previous: CityRoomMessageLike | null | undefined,
  current: CityRoomMessageLike
) {
  return !isSameCityRoomMessageGroup(previous, current);
}

export function getCityRoomMessageSpacingClass(
  previous: CityRoomMessageLike | null | undefined,
  current: CityRoomMessageLike,
  hadDateSeparator: boolean
) {
  if (hadDateSeparator || !previous) {
    return "mt-1";
  }

  if (!isSameCityRoomMessageGroup(previous, current)) {
    return "mt-3";
  }

  return "mt-0.5";
}

export function getCityRoomGroupPosition(messages: CityRoomMessageLike[], index: number) {
  const current = messages[index]!;
  const previous = index > 0 ? messages[index - 1]! : null;
  const next = index < messages.length - 1 ? messages[index + 1]! : null;

  return {
    isFirstInGroup: !isSameCityRoomMessageGroup(previous, current),
    isLastInGroup: !next || !isSameCityRoomMessageGroup(current, next),
  };
}

export function getCityRoomBubbleCornerClass(isFirstInGroup: boolean, isLastInGroup: boolean) {
  if (isFirstInGroup && isLastInGroup) {
    return "rounded-2xl rounded-tl-md";
  }

  if (isFirstInGroup) {
    return "rounded-2xl rounded-tl-md";
  }

  if (isLastInGroup) {
    return "rounded-2xl rounded-bl-md rounded-tl-sm";
  }

  return "rounded-2xl rounded-l-md rounded-tl-sm";
}
