export const DEFAULT_CONTEXTUAL_COMPANION_WIDTH = 'min(460px, 48%)';

export type ContextualViewLayout = {
  placement: 'overlay-right' | 'left-of-companion';
  companionWidth: string | null;
  left: number | 'auto';
  right: number | string;
  width: string;
  minWidth: number;
  borderLeft: string;
  borderRight: string;
  boxShadow: string;
};

function companionWidth(params: Record<string, string>): string {
  const requested = params.contextCompanionWidth?.trim();
  return requested || DEFAULT_CONTEXTUAL_COMPANION_WIDTH;
}

export function contextualViewLayout(
  params: Record<string, string>,
): ContextualViewLayout {
  if (params.contextPlacement === 'left-of-companion') {
    const reserved = companionWidth(params);
    return {
      placement: 'left-of-companion',
      companionWidth: reserved,
      left: 0,
      right: reserved,
      width: 'auto',
      minWidth: 0,
      borderLeft: 'none',
      borderRight: '1px solid #3c3c3c',
      boxShadow: '18px 0 46px rgba(0, 0, 0, 0.38)',
    };
  }
  return {
    placement: 'overlay-right',
    companionWidth: null,
    left: 'auto',
    right: 0,
    width: 'min(760px, 68vw)',
    minWidth: 480,
    borderLeft: '1px solid #3c3c3c',
    borderRight: 'none',
    boxShadow: '-18px 0 46px rgba(0, 0, 0, 0.48)',
  };
}
