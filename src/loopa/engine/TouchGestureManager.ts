import {
  TouchControlSettings,
  TouchModifierKey,
  TouchModifierState,
  WorkMode,
} from '../core/project/types';

export interface TrackedPointer {
  id: number;
  pointerType: string;
  startX: number;
  startY: number;
  currX: number;
  currY: number;
  downTime: number;
}

export interface BoxSelectRect {
  startX: number;
  startY: number;
  currX: number;
  currY: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface TouchModifierDescriptor {
  key: TouchModifierKey;
  label: string;
  badgeText: string;
  implemented: boolean;
  description: string;
}

export const TOUCH_MODIFIER_REGISTRY: TouchModifierDescriptor[] = [
  {
    key: 'shift',
    label: 'SHIFT',
    badgeText: 'SHIFT',
    implemented: true,
    description:
      'Selección múltiple aditiva por toque, Caja de selección aditiva, gesto de 2 dedos y combinaciones de atajos (ej. Shift+O, Ctrl+Shift+Z).',
  },
  {
    key: 'ctrl',
    label: 'CTRL',
    badgeText: 'CTRL',
    implemented: true,
    description:
      'CTRL + arrastre: rotación libre (trackball virtual) de objetos o geometría seleccionada. Combinaciones: Ctrl+Shift (Primitivas), Ctrl+Alt (Operaciones especiales), Ctrl+Z / Ctrl+S.',
  },
  {
    key: 'alt',
    label: 'ALT',
    badgeText: 'ALT',
    implemented: true,
    description:
      'ALT + toque en el visor: alternar entre Modo Objeto y Modo Edición. Combinaciones: Ctrl+Alt (Operaciones especiales), Alt+A (Deseleccionar), Alt+O (Solo conectados).',
  },
];

export const EMPTY_MODIFIER_STATE: TouchModifierState = {
  shift: false,
  ctrl: false,
  alt: false,
};

export interface TouchGestureCallbacks {
  isGizmoBusy: () => boolean;
  isBoxSelectDisabled?: () => boolean;
  isShiftHoldDisabled?: () => boolean;
  isTrackballDisabled?: () => boolean;
  canTrackballRotate?: () => boolean;
  getWorkMode: () => WorkMode;
  hasLongPressTarget?: (
    clientX: number,
    clientY: number,
    pointerType: string,
  ) => boolean;
  onSingleTap: (
    clientX: number,
    clientY: number,
    pointerType: string,
    modifiers: TouchModifierState,
    shiftKey: boolean,
  ) => void;
  onAltTap?: () => void;
  onTwoFingerTap: () => void;
  onThreeFingerTap: () => void;
  onLongPress: (clientX: number, clientY: number, pointerType: string) => void;
  onBoxSelectStart?: (
    rect: BoxSelectRect,
    modifiers: TouchModifierState,
    shiftKey: boolean,
  ) => void;
  onBoxSelectMove?: (
    rect: BoxSelectRect,
    modifiers: TouchModifierState,
    shiftKey: boolean,
  ) => void;
  onBoxSelectEnd?: (
    rect: BoxSelectRect,
    modifiers: TouchModifierState,
    shiftKey: boolean,
  ) => void;
  onBoxSelectCancel?: () => void;
  onTrackballRotateStart?: (clientX: number, clientY: number) => void;
  onTrackballRotateMove?: (clientX: number, clientY: number) => void;
  onTrackballRotateEnd?: () => void;
  onTrackballRotateCancel?: () => void;
  isModalTransformArmed?: () => boolean;
  onModalTransformStart?: (clientX: number, clientY: number) => void;
  onModalTransformMove?: (clientX: number, clientY: number) => void;
  onModalTransformEnd?: () => void;
  onModalTransformCancel?: () => void;
  onModifierStateChange?: (modifiers: TouchModifierState) => void;
  onTouchNavigationChange: (
    activePointers: ReadonlyMap<number, TrackedPointer>,
    modifiers: TouchModifierState,
    isBoxSelectBlocking: boolean,
  ) => void;
}

interface SecondaryTapCandidate {
  id: number;
  downTime: number;
  startX: number;
  startY: number;
  maxMove: number;
}

interface ArmedBoxSelectState {
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  currX: number;
  currY: number;
  downTime: number;
  activeDrag: boolean;
}

interface ArmedTrackballState {
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  currX: number;
  currY: number;
  downTime: number;
  activeDrag: boolean;
  canRotate: boolean;
}

interface ArmedModalDragState {
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  currX: number;
  currY: number;
  activeDrag: boolean;
}

const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_LIMIT_PX = 10;
const SHIFT_HOLD_DELAY_MS = 170;
const SHIFT_HOLD_MOVE_LIMIT_PX = 11;
const SECONDARY_TAP_MOVE_PX = 14;
const SECONDARY_TAP_MAX_MS = 420;
const SINGLE_TAP_MOVE_TOUCH_PX = 11;
const SINGLE_TAP_MOVE_MOUSE_PX = 8;
const SINGLE_TAP_MAX_MS = 420;
const TWO_FINGER_TAP_MOVE_PX = 24;
const TWO_FINGER_TAP_MAX_MS = 360;
const THREE_FINGER_TAP_MOVE_PX = 28;
const THREE_FINGER_TAP_MAX_MS = 420;
const BOX_SELECT_DRAG_THRESHOLD_PX = 7;
const TRACKBALL_DRAG_THRESHOLD_PX = 6;
const MODAL_DRAG_THRESHOLD_PX = 4;
const DOUBLE_TAP_MAX_DISTANCE_TOUCH_PX = 36;
const DOUBLE_TAP_MAX_DISTANCE_MOUSE_PX = 20;

export class TouchGestureManager {
  private element: HTMLElement;
  private config: TouchControlSettings;
  private callbacks: TouchGestureCallbacks;

  private pointers = new Map<number, TrackedPointer>();
  private peakCount = 0;
  private maxMoveDist = 0;
  private episodeStartTime = 0;
  private episodeInvalidated = false;
  private longPressTimer: number | null = null;
  private shiftHoldTimer: number | null = null;
  private shiftHoldPointerId: number | null = null;
  private shiftHoldActive = false;
  private shiftHoldWasActivated = false;
  private shiftSecondFingerUsed = false;
  private altTapCandidate = false;
  private secondaryTapCandidate: SecondaryTapCandidate | null = null;
  private externalModifiers: TouchModifierState = { ...EMPTY_MODIFIER_STATE };

  private lastTap: {
    time: number;
    x: number;
    y: number;
    pointerType: string;
  } | null = null;
  private boxSelectArmed: ArmedBoxSelectState | null = null;
  private trackballState: ArmedTrackballState | null = null;
  private modalDragState: ArmedModalDragState | null = null;

  private disposed = false;

  constructor(
    element: HTMLElement,
    initialConfig: TouchControlSettings,
    callbacks: TouchGestureCallbacks,
  ) {
    this.element = element;
    this.config = initialConfig;
    this.callbacks = callbacks;

    this.element.addEventListener('pointerdown', this.handlePointerDown);
    this.element.addEventListener('pointermove', this.handlePointerMove);
    this.element.addEventListener('pointerup', this.handlePointerUp);
    this.element.addEventListener('pointercancel', this.handlePointerCancel);
    this.element.addEventListener('contextmenu', this.handleContextMenu);
    window.addEventListener('blur', this.handleWindowBlur);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  public getModifierState(): TouchModifierState {
    return {
      shift: this.shiftHoldActive,
      ctrl: false,
      alt: false,
    };
  }

  public setExternalModifiers(mods: TouchModifierState): void {
    const next: TouchModifierState = {
      shift: Boolean(mods.shift),
      ctrl: Boolean(mods.ctrl),
      alt: Boolean(mods.alt),
    };
    const changed =
      this.externalModifiers.shift !== next.shift ||
      this.externalModifiers.ctrl !== next.ctrl ||
      this.externalModifiers.alt !== next.alt;
    if (!changed) return;
    this.externalModifiers = next;

    if (this.trackballState && !(next.ctrl && !next.shift && !next.alt)) {
      if (this.trackballState.activeDrag) {
        if (!next.shift && !next.alt) {
          this.finishTrackball(true);
        } else {
          this.cancelTrackball(true);
        }
      } else {
        this.cancelTrackball(true);
      }
    }
  }

  private getEffectiveModifiers(e?: PointerEvent): TouchModifierState {
    return {
      shift:
        this.shiftHoldActive ||
        this.externalModifiers.shift ||
        Boolean(e?.shiftKey),
      ctrl:
        this.externalModifiers.ctrl ||
        Boolean(e && (e.ctrlKey || e.metaKey)),
      alt: this.externalModifiers.alt || Boolean(e?.altKey),
    };
  }

  public isBoxSelectBlockingOrbit(): boolean {
    return (
      this.boxSelectArmed !== null ||
      this.trackballState !== null ||
      this.modalDragState !== null
    );
  }

  public updateConfig(nextConfig: TouchControlSettings): void {
    this.config = nextConfig;
    if (!this.isShiftHoldEnabled() && this.shiftHoldActive) {
      this.deactivateShiftHold(true);
    }
    if (nextConfig.doubleTapBoxSelect === false && this.boxSelectArmed) {
      this.cancelBoxSelect(true);
    }
  }

  public syncWorkMode(_workMode: WorkMode): void {
    // Touch modifiers are supported across Object Mode and Edit Mode.
  }

  public invalidateCurrentGesture(): void {
    this.clearLongPressTimer();
    this.clearShiftHoldTimer();
    this.deactivateShiftHold(true);
    this.cancelBoxSelect(true);
    this.cancelTrackball(true);
    this.cancelModalDrag(true);
    this.altTapCandidate = false;
    this.lastTap = null;
    this.episodeInvalidated = true;
  }

  private buildBoxRect(state: ArmedBoxSelectState): BoxSelectRect {
    return {
      startX: state.startX,
      startY: state.startY,
      currX: state.currX,
      currY: state.currY,
      minX: Math.min(state.startX, state.currX),
      minY: Math.min(state.startY, state.currY),
      maxX: Math.max(state.startX, state.currX),
      maxY: Math.max(state.startY, state.currY),
    };
  }

  private releaseCaptureSafely(pointerId: number): void {
    try {
      if (this.element.hasPointerCapture(pointerId)) {
        this.element.releasePointerCapture(pointerId);
      }
    } catch {
      // Ignore capture errors on detached elements or synthetic events
    }
  }

  private cancelBoxSelect(notify: boolean): void {
    if (!this.boxSelectArmed) return;
    const state = this.boxSelectArmed;
    this.boxSelectArmed = null;
    this.releaseCaptureSafely(state.pointerId);
    if (state.activeDrag && notify) {
      this.callbacks.onBoxSelectCancel?.();
    }
    if (notify) {
      this.callbacks.onTouchNavigationChange(
        this.pointers,
        this.getEffectiveModifiers(),
        this.isBoxSelectBlockingOrbit(),
      );
    }
  }

  private cancelTrackball(notify: boolean): void {
    if (!this.trackballState) return;
    const state = this.trackballState;
    this.trackballState = null;
    this.releaseCaptureSafely(state.pointerId);
    if (state.activeDrag && notify) {
      this.callbacks.onTrackballRotateCancel?.();
    }
    if (notify) {
      this.callbacks.onTouchNavigationChange(
        this.pointers,
        this.getEffectiveModifiers(),
        this.isBoxSelectBlockingOrbit(),
      );
    }
  }

  private finishTrackball(notify: boolean): void {
    if (!this.trackballState) return;
    const state = this.trackballState;
    this.trackballState = null;
    this.releaseCaptureSafely(state.pointerId);
    if (state.activeDrag && notify) {
      this.callbacks.onTrackballRotateEnd?.();
    }
    if (notify) {
      this.callbacks.onTouchNavigationChange(
        this.pointers,
        this.getEffectiveModifiers(),
        this.isBoxSelectBlockingOrbit(),
      );
    }
  }

  private cancelModalDrag(notify: boolean): void {
    if (!this.modalDragState) return;
    const state = this.modalDragState;
    this.modalDragState = null;
    this.releaseCaptureSafely(state.pointerId);
    if (state.activeDrag && notify) {
      this.callbacks.onModalTransformCancel?.();
    }
    if (notify) {
      this.callbacks.onTouchNavigationChange(
        this.pointers,
        this.getEffectiveModifiers(),
        this.isBoxSelectBlockingOrbit(),
      );
    }
  }

  private isShiftHoldEnabled(): boolean {
    const shiftCfg = this.config.modifiers?.shift;
    return Boolean(shiftCfg?.enabled && shiftCfg?.twoFingerHold);
  }

  private clearLongPressTimer(): void {
    if (this.longPressTimer !== null) {
      window.clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  private clearShiftHoldTimer(): void {
    if (this.shiftHoldTimer !== null) {
      window.clearTimeout(this.shiftHoldTimer);
      this.shiftHoldTimer = null;
    }
  }

  private deactivateShiftHold(notify = true): void {
    this.clearShiftHoldTimer();
    const wasActive = this.shiftHoldActive;
    this.shiftHoldActive = false;
    this.shiftHoldPointerId = null;
    this.secondaryTapCandidate = null;
    if (wasActive && notify) {
      const state = this.getModifierState();
      this.callbacks.onModifierStateChange?.(state);
      this.callbacks.onTouchNavigationChange(
        this.pointers,
        this.getEffectiveModifiers(),
        this.isBoxSelectBlockingOrbit(),
      );
    }
  }

  private resetEpisode(): void {
    this.clearLongPressTimer();
    this.clearShiftHoldTimer();
    this.deactivateShiftHold(false);
    this.peakCount = 0;
    this.maxMoveDist = 0;
    this.episodeStartTime = 0;
    this.episodeInvalidated = false;
    this.shiftHoldWasActivated = false;
    this.shiftSecondFingerUsed = false;
    this.altTapCandidate = false;
  }

  private handleContextMenu = (e: MouseEvent) => {
    if (this.config.longPressContextMenu) {
      e.preventDefault();
    }
  };

  private handleVisibilityChange = () => {
    if (document.hidden) {
      this.handleWindowBlur();
    }
  };

  private handleWindowBlur = () => {
    const hadShift = this.shiftHoldActive;
    this.clearLongPressTimer();
    this.clearShiftHoldTimer();
    this.cancelBoxSelect(true);
    this.cancelTrackball(true);
    this.cancelModalDrag(true);
    this.lastTap = null;
    this.pointers.clear();
    this.resetEpisode();
    const state = this.getModifierState();
    if (hadShift) {
      this.callbacks.onModifierStateChange?.(state);
    }
    this.callbacks.onTouchNavigationChange(
      this.pointers,
      this.getEffectiveModifiers(),
      false,
    );
  };

  private handlePointerDown = (e: PointerEvent) => {
    if (this.disposed) return;
    if (e.target !== this.element) return;

    const now = performance.now();
    if (this.pointers.size === 0) {
      this.resetEpisode();
      this.episodeStartTime = now;
    }

    const tracked: TrackedPointer = {
      id: e.pointerId,
      pointerType: e.pointerType,
      startX: e.clientX,
      startY: e.clientY,
      currX: e.clientX,
      currY: e.clientY,
      downTime: now,
    };
    this.pointers.set(e.pointerId, tracked);
    this.peakCount = Math.max(this.peakCount, this.pointers.size);

    const effMods = this.getEffectiveModifiers(e);

    if (this.callbacks.isGizmoBusy()) {
      this.clearLongPressTimer();
      this.deactivateShiftHold(true);
      this.cancelBoxSelect(true);
      this.cancelTrackball(true);
      this.cancelModalDrag(true);
      this.lastTap = null;
      this.episodeInvalidated = true;
      this.callbacks.onTouchNavigationChange(
        this.pointers,
        effMods,
        false,
      );
      return;
    }

    // Multi-finger touch cancels armed pre-drag modal/trackball/box selection cleanly so pinch/pan/undo work seamlessly
    if (this.pointers.size > 1 && this.modalDragState) {
      if (!this.modalDragState.activeDrag) {
        this.cancelModalDrag(true);
        this.lastTap = null;
      } else {
        return;
      }
    }

    if (this.pointers.size > 1 && this.trackballState) {
      if (!this.trackballState.activeDrag) {
        this.cancelTrackball(true);
        this.lastTap = null;
      } else {
        return;
      }
    }

    if (this.pointers.size > 1 && this.boxSelectArmed) {
      if (!this.boxSelectArmed.activeDrag) {
        this.cancelBoxSelect(true);
        this.lastTap = null;
      } else {
        // Ignore stray second touch while actively drawing a box selection
        return;
      }
    }

    if (this.pointers.size === 1) {
      const isValidButton = e.pointerType !== 'mouse' || e.button === 0;

      // ALT + tap -> mode toggle candidate (never triggers box select, long press, or shift hold)
      if (effMods.alt && !effMods.ctrl && !effMods.shift) {
        this.lastTap = null;
        this.clearLongPressTimer();
        this.clearShiftHoldTimer();
        this.altTapCandidate = isValidButton;
        this.callbacks.onTouchNavigationChange(this.pointers, effMods, false);
        return;
      }

      // CTRL + drag -> virtual trackball rotation; static CTRL + tap -> path selection
      if (effMods.ctrl && !effMods.shift && !effMods.alt && isValidButton) {
        this.lastTap = null;
        this.clearLongPressTimer();
        this.clearShiftHoldTimer();
        const canTrackball =
          !this.callbacks.isTrackballDisabled?.() &&
          (this.callbacks.canTrackballRotate?.() ?? true);
        this.trackballState = {
          pointerId: e.pointerId,
          pointerType: e.pointerType,
          startX: e.clientX,
          startY: e.clientY,
          currX: e.clientX,
          currY: e.clientY,
          downTime: now,
          activeDrag: false,
          canRotate: canTrackball,
        };
        try {
          this.element.setPointerCapture(e.pointerId);
        } catch {
          // Ignore capture error on detached/synthetic events
        }
        this.callbacks.onTouchNavigationChange(this.pointers, effMods, true);
        return;
      }

      // G Modal Move / Slide -> 1-finger drag directly transforms selection (2 fingers still yield to orbit/zoom/pan!)
      if (
        !effMods.ctrl &&
        !effMods.alt &&
        !effMods.shift &&
        isValidButton &&
        this.callbacks.isModalTransformArmed?.()
      ) {
        this.lastTap = null;
        this.clearLongPressTimer();
        this.clearShiftHoldTimer();
        this.modalDragState = {
          pointerId: e.pointerId,
          pointerType: e.pointerType,
          startX: e.clientX,
          startY: e.clientY,
          currX: e.clientX,
          currY: e.clientY,
          activeDrag: false,
        };
        try {
          this.element.setPointerCapture(e.pointerId);
        } catch {
          // Ignore capture error
        }
        this.callbacks.onTouchNavigationChange(this.pointers, effMods, true);
        return;
      }

      const boxEnabled =
        this.config.doubleTapBoxSelect !== false &&
        !this.callbacks.isBoxSelectDisabled?.();
      const intervalMs = Math.max(
        180,
        Math.min(600, this.config.doubleTapIntervalMs ?? 320),
      );
      const distLimit =
        e.pointerType === 'touch'
          ? DOUBLE_TAP_MAX_DISTANCE_TOUCH_PX
          : DOUBLE_TAP_MAX_DISTANCE_MOUSE_PX;

      if (
        boxEnabled &&
        isValidButton &&
        this.lastTap &&
        now - this.lastTap.time <= intervalMs &&
        Math.hypot(e.clientX - this.lastTap.x, e.clientY - this.lastTap.y) <=
          distLimit
      ) {
        // 2nd rapid tap held down: arm Rectangular Box Selection & lock camera orbit immediately
        this.lastTap = null;
        this.clearLongPressTimer();
        this.clearShiftHoldTimer();
        this.boxSelectArmed = {
          pointerId: e.pointerId,
          pointerType: e.pointerType,
          startX: e.clientX,
          startY: e.clientY,
          currX: e.clientX,
          currY: e.clientY,
          downTime: now,
          activeDrag: false,
        };
        try {
          this.element.setPointerCapture(e.pointerId);
        } catch {
          // Ignore if element cannot capture pointer
        }
        this.callbacks.onTouchNavigationChange(
          this.pointers,
          effMods,
          true,
        );
        return;
      }

      // First touch/click -> never activate box selection tool; schedule standard SHIFT hold & long-press
      if (
        e.pointerType === 'touch' &&
        this.isShiftHoldEnabled() &&
        !this.callbacks.isShiftHoldDisabled?.()
      ) {
        const downId = e.pointerId;
        this.shiftHoldPointerId = downId;
        this.shiftHoldTimer = window.setTimeout(() => {
          this.shiftHoldTimer = null;
          if (this.disposed) return;
          if (this.pointers.size !== 1 || this.peakCount !== 1) return;
          if (this.boxSelectArmed) return;
          if (this.episodeInvalidated || this.callbacks.isGizmoBusy()) return;
          if (!this.isShiftHoldEnabled()) return;
          const ptr = this.pointers.get(downId);
          if (!ptr) return;
          const moved = Math.hypot(
            ptr.currX - ptr.startX,
            ptr.currY - ptr.startY,
          );
          if (moved > SHIFT_HOLD_MOVE_LIMIT_PX) return;

          this.shiftHoldActive = true;
          this.shiftHoldWasActivated = true;
          const state = this.getModifierState();
          this.callbacks.onModifierStateChange?.(state);
          this.callbacks.onTouchNavigationChange(
            this.pointers,
            this.getEffectiveModifiers(),
            false,
          );
        }, SHIFT_HOLD_DELAY_MS);
      }

      if (
        this.config.longPressContextMenu &&
        (e.pointerType !== 'mouse' || e.button === 0)
      ) {
        const downId = e.pointerId;
        this.longPressTimer = window.setTimeout(() => {
          this.longPressTimer = null;
          if (this.disposed) return;
          if (this.boxSelectArmed || this.trackballState) return;
          if (
            this.pointers.size !== 1 ||
            this.peakCount !== 1 ||
            this.shiftSecondFingerUsed
          ) {
            return;
          }
          if (this.episodeInvalidated || this.callbacks.isGizmoBusy()) return;
          const ptr = this.pointers.get(downId);
          if (!ptr) return;
          const moved = Math.hypot(
            ptr.currX - ptr.startX,
            ptr.currY - ptr.startY,
          );
          if (moved > LONG_PRESS_MOVE_LIMIT_PX) return;

          if (
            this.isShiftHoldEnabled() &&
            ptr.pointerType === 'touch' &&
            this.callbacks.hasLongPressTarget &&
            !this.callbacks.hasLongPressTarget(
              ptr.currX,
              ptr.currY,
              ptr.pointerType,
            )
          ) {
            return;
          }

          if (this.shiftHoldActive) {
            this.deactivateShiftHold(true);
          } else {
            this.clearShiftHoldTimer();
            this.shiftHoldPointerId = null;
          }
          this.lastTap = null;
          this.episodeInvalidated = true;
          this.callbacks.onLongPress(ptr.currX, ptr.currY, ptr.pointerType);
        }, LONG_PRESS_MS);
      }
    } else if (
      this.shiftHoldActive &&
      this.shiftHoldPointerId !== null &&
      this.pointers.has(this.shiftHoldPointerId) &&
      e.pointerType === 'touch' &&
      this.pointers.size === 2
    ) {
      // Second finger placed while Finger 1 is holding SHIFT -> tap candidate
      this.clearLongPressTimer();
      this.lastTap = null;
      this.shiftSecondFingerUsed = true;
      this.secondaryTapCandidate = {
        id: e.pointerId,
        downTime: now,
        startX: e.clientX,
        startY: e.clientY,
        maxMove: 0,
      };
    } else {
      // Multi-finger navigation / tap (2-finger Undo, pinch, pan, 3-finger Redo)
      this.clearLongPressTimer();
      this.clearShiftHoldTimer();
      this.lastTap = null;
      this.altTapCandidate = false;
      if (this.shiftHoldActive && !this.shiftSecondFingerUsed) {
        this.deactivateShiftHold(true);
      }
      this.secondaryTapCandidate = null;
      if (e.pointerType === 'mouse' || this.peakCount > 3) {
        this.episodeInvalidated = true;
      }
    }

    this.callbacks.onTouchNavigationChange(
      this.pointers,
      this.getEffectiveModifiers(e),
      this.isBoxSelectBlockingOrbit(),
    );
  };

  private handlePointerMove = (e: PointerEvent) => {
    if (this.disposed) return;

    // Handle active / armed G modal Move/Slide drag exclusively
    if (this.modalDragState && this.modalDragState.pointerId === e.pointerId) {
      if (this.callbacks.isGizmoBusy() || !this.callbacks.isModalTransformArmed?.()) {
        this.cancelModalDrag(true);
        return;
      }
      const ptr = this.pointers.get(e.pointerId);
      if (ptr) {
        ptr.currX = e.clientX;
        ptr.currY = e.clientY;
      }
      this.modalDragState.currX = e.clientX;
      this.modalDragState.currY = e.clientY;
      const dist = Math.hypot(
        e.clientX - this.modalDragState.startX,
        e.clientY - this.modalDragState.startY,
      );
      if (dist > this.maxMoveDist) {
        this.maxMoveDist = dist;
      }
      if (!this.modalDragState.activeDrag) {
        if (dist >= MODAL_DRAG_THRESHOLD_PX) {
          this.modalDragState.activeDrag = true;
          this.callbacks.onModalTransformStart?.(
            this.modalDragState.startX,
            this.modalDragState.startY,
          );
          this.callbacks.onModalTransformMove?.(e.clientX, e.clientY);
        }
      } else {
        this.callbacks.onModalTransformMove?.(e.clientX, e.clientY);
      }
      return;
    }

    // Handle active / armed CTRL + drag Virtual Trackball rotation exclusively
    if (this.trackballState && this.trackballState.pointerId === e.pointerId) {
      const eff = this.getEffectiveModifiers(e);
      if (this.callbacks.isGizmoBusy()) {
        this.cancelTrackball(true);
        return;
      }
      if (!eff.ctrl || eff.shift || eff.alt) {
        if (this.trackballState.activeDrag && !eff.shift && !eff.alt) {
          this.finishTrackball(true);
        } else {
          this.cancelTrackball(true);
        }
        return;
      }
      const ptr = this.pointers.get(e.pointerId);
      if (ptr) {
        ptr.currX = e.clientX;
        ptr.currY = e.clientY;
      }
      this.trackballState.currX = e.clientX;
      this.trackballState.currY = e.clientY;
      const dist = Math.hypot(
        e.clientX - this.trackballState.startX,
        e.clientY - this.trackballState.startY,
      );
      if (dist > this.maxMoveDist) {
        this.maxMoveDist = dist;
      }
      if (!this.trackballState.activeDrag) {
        if (
          this.trackballState.canRotate &&
          dist >= TRACKBALL_DRAG_THRESHOLD_PX
        ) {
          this.trackballState.activeDrag = true;
          this.callbacks.onTrackballRotateStart?.(
            this.trackballState.startX,
            this.trackballState.startY,
          );
          this.callbacks.onTrackballRotateMove?.(e.clientX, e.clientY);
        }
      } else {
        this.callbacks.onTrackballRotateMove?.(e.clientX, e.clientY);
      }
      return;
    }

    // Handle active / armed double-tap + drag box selection exclusively
    if (this.boxSelectArmed && this.boxSelectArmed.pointerId === e.pointerId) {
      if (this.callbacks.isGizmoBusy()) {
        this.cancelBoxSelect(true);
        return;
      }
      const ptr = this.pointers.get(e.pointerId);
      if (ptr) {
        ptr.currX = e.clientX;
        ptr.currY = e.clientY;
      }
      this.boxSelectArmed.currX = e.clientX;
      this.boxSelectArmed.currY = e.clientY;
      const dist = Math.hypot(
        e.clientX - this.boxSelectArmed.startX,
        e.clientY - this.boxSelectArmed.startY,
      );
      if (dist > this.maxMoveDist) {
        this.maxMoveDist = dist;
      }

      if (!this.boxSelectArmed.activeDrag) {
        if (dist >= BOX_SELECT_DRAG_THRESHOLD_PX) {
          this.boxSelectArmed.activeDrag = true;
          const rect = this.buildBoxRect(this.boxSelectArmed);
          const modifiers = this.getEffectiveModifiers(e);
          this.callbacks.onBoxSelectStart?.(rect, modifiers, e.shiftKey);
          this.callbacks.onBoxSelectMove?.(rect, modifiers, e.shiftKey);
        }
      } else {
        this.callbacks.onBoxSelectMove?.(
          this.buildBoxRect(this.boxSelectArmed),
          this.getEffectiveModifiers(e),
          e.shiftKey,
        );
      }
      return;
    }

    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) return;

    ptr.currX = e.clientX;
    ptr.currY = e.clientY;

    const moved = Math.hypot(ptr.currX - ptr.startX, ptr.currY - ptr.startY);
    if (moved > this.maxMoveDist) {
      this.maxMoveDist = moved;
    }

    if (moved > SINGLE_TAP_MOVE_TOUCH_PX) {
      this.lastTap = null;
    }

    if (
      this.shiftHoldPointerId === e.pointerId &&
      !this.shiftHoldActive &&
      moved > SHIFT_HOLD_MOVE_LIMIT_PX
    ) {
      // Finger 1 moved right away -> treat as 1-finger Orbit, not SHIFT hold
      this.clearShiftHoldTimer();
      this.shiftHoldPointerId = null;
    }

    if (
      this.secondaryTapCandidate &&
      this.secondaryTapCandidate.id === e.pointerId
    ) {
      const m2 = Math.hypot(
        e.clientX - this.secondaryTapCandidate.startX,
        e.clientY - this.secondaryTapCandidate.startY,
      );
      if (m2 > this.secondaryTapCandidate.maxMove) {
        this.secondaryTapCandidate.maxMove = m2;
      }
    }

    if (moved > LONG_PRESS_MOVE_LIMIT_PX && this.longPressTimer !== null) {
      this.clearLongPressTimer();
    }

    if (this.callbacks.isGizmoBusy()) {
      this.clearLongPressTimer();
      this.deactivateShiftHold(true);
      this.episodeInvalidated = true;
    }
  };

  private handlePointerUp = (e: PointerEvent) => {
    if (this.disposed) return;

    // Handle G modal Move/Slide release (confirm on finger lift!)
    if (this.modalDragState && this.modalDragState.pointerId === e.pointerId) {
      const state = this.modalDragState;
      this.modalDragState = null;
      this.releaseCaptureSafely(e.pointerId);
      this.pointers.delete(e.pointerId);

      if (state.activeDrag) {
        this.callbacks.onModalTransformEnd?.();
      }
      this.lastTap = null;
      this.resetEpisode();
      this.callbacks.onTouchNavigationChange(
        this.pointers,
        this.getEffectiveModifiers(e),
        false,
      );
      return;
    }

    // Handle CTRL + drag Virtual Trackball release OR static CTRL + tap path selection
    if (this.trackballState && this.trackballState.pointerId === e.pointerId) {
      const state = this.trackballState;
      state.currX = e.clientX;
      state.currY = e.clientY;
      this.trackballState = null;
      this.releaseCaptureSafely(e.pointerId);
      this.pointers.delete(e.pointerId);

      const modifiers = this.getEffectiveModifiers(e);
      const dt = performance.now() - state.downTime;
      const moved = Math.hypot(
        state.currX - state.startX,
        state.currY - state.startY,
      );

      if (state.activeDrag) {
        this.callbacks.onTrackballRotateEnd?.();
      } else {
        const moveLimit =
          state.pointerType === 'touch'
            ? SINGLE_TAP_MOVE_TOUCH_PX
            : SINGLE_TAP_MOVE_MOUSE_PX;
        const tapEnabled =
          state.pointerType !== 'touch' || this.config.oneFingerTapSelect;
        if (
          tapEnabled &&
          !this.callbacks.isGizmoBusy() &&
          moved <= moveLimit &&
          dt <= SINGLE_TAP_MAX_MS
        ) {
          this.callbacks.onSingleTap(
            e.clientX,
            e.clientY,
            state.pointerType,
            { ...modifiers, ctrl: true },
            e.shiftKey,
          );
        }
      }
      this.lastTap = null;
      this.resetEpisode();
      this.callbacks.onTouchNavigationChange(
        this.pointers,
        this.getEffectiveModifiers(e),
        false,
      );
      return;
    }

    // Handle Double-Tap + Hold & Drag Box Selection release
    if (this.boxSelectArmed && this.boxSelectArmed.pointerId === e.pointerId) {
      const state = this.boxSelectArmed;
      state.currX = e.clientX;
      state.currY = e.clientY;
      this.boxSelectArmed = null;
      this.releaseCaptureSafely(e.pointerId);
      this.pointers.delete(e.pointerId);

      const modifiers = this.getEffectiveModifiers(e);
      const dt = performance.now() - state.downTime;
      const moved = Math.hypot(
        state.currX - state.startX,
        state.currY - state.startY,
      );

      if (state.activeDrag) {
        this.callbacks.onBoxSelectEnd?.(
          this.buildBoxRect(state),
          modifiers,
          e.shiftKey,
        );
      } else {
        // Quick second tap without dragging -> perform normal tap selection (do NOT chain into 3rd tap)
        const moveLimit =
          state.pointerType === 'touch'
            ? SINGLE_TAP_MOVE_TOUCH_PX
            : SINGLE_TAP_MOVE_MOUSE_PX;
        const tapEnabled =
          state.pointerType !== 'touch' || this.config.oneFingerTapSelect;
        if (
          tapEnabled &&
          !this.callbacks.isGizmoBusy() &&
          moved <= moveLimit &&
          dt <= SINGLE_TAP_MAX_MS
        ) {
          this.callbacks.onSingleTap(
            e.clientX,
            e.clientY,
            state.pointerType,
            modifiers,
            e.shiftKey,
          );
        }
      }

      this.resetEpisode();
      this.callbacks.onTouchNavigationChange(
        this.pointers,
        this.getEffectiveModifiers(e),
        false,
      );
      return;
    }

    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) {
      this.callbacks.onTouchNavigationChange(
        this.pointers,
        this.getEffectiveModifiers(e),
        this.isBoxSelectBlockingOrbit(),
      );
      return;
    }

    ptr.currX = e.clientX;
    ptr.currY = e.clientY;
    const moved = Math.hypot(ptr.currX - ptr.startX, ptr.currY - ptr.startY);
    if (moved > this.maxMoveDist) {
      this.maxMoveDist = moved;
    }

    // Handle 2nd-finger tap release while Finger 1 remains holding SHIFT
    if (
      this.shiftHoldActive &&
      this.secondaryTapCandidate &&
      this.secondaryTapCandidate.id === e.pointerId
    ) {
      const cand = this.secondaryTapCandidate;
      this.secondaryTapCandidate = null;
      const m2 = Math.hypot(e.clientX - cand.startX, e.clientY - cand.startY);
      const maxM2 = Math.max(cand.maxMove, m2);
      const dt2 = performance.now() - cand.downTime;

      this.pointers.delete(e.pointerId);

      if (
        !this.callbacks.isGizmoBusy() &&
        this.config.oneFingerTapSelect &&
        maxM2 <= SECONDARY_TAP_MOVE_PX &&
        dt2 <= SECONDARY_TAP_MAX_MS
      ) {
        this.callbacks.onSingleTap(
          e.clientX,
          e.clientY,
          e.pointerType,
          this.getEffectiveModifiers(e),
          e.shiftKey,
        );
      }

      this.callbacks.onTouchNavigationChange(
        this.pointers,
        this.getEffectiveModifiers(e),
        this.isBoxSelectBlockingOrbit(),
      );
      if (this.pointers.size === 0) {
        this.deactivateShiftHold(true);
        this.resetEpisode();
      }
      return;
    }

    this.pointers.delete(e.pointerId);
    this.clearLongPressTimer();

    // If the SHIFT-holding Finger 1 lifted, immediately deactivate SHIFT
    if (this.shiftHoldPointerId === e.pointerId) {
      const hadActiveShift = this.shiftHoldActive;
      this.clearShiftHoldTimer();
      this.shiftHoldActive = false;
      this.shiftHoldPointerId = null;
      this.secondaryTapCandidate = null;
      if (hadActiveShift) {
        this.callbacks.onModifierStateChange?.(this.getModifierState());
      }
    }

    if (this.pointers.size === 0) {
      const now = performance.now();
      const dt = now - this.episodeStartTime;
      const effMods = this.getEffectiveModifiers(e);
      this.callbacks.onTouchNavigationChange(this.pointers, effMods, false);

      const usedModifierFlow =
        this.shiftHoldWasActivated || this.shiftSecondFingerUsed;

      if (
        !usedModifierFlow &&
        !this.episodeInvalidated &&
        !this.callbacks.isGizmoBusy()
      ) {
        if (this.peakCount === 1) {
          const isValidButton = e.pointerType !== 'mouse' || e.button === 0;
          const moveLimit =
            e.pointerType === 'touch'
              ? SINGLE_TAP_MOVE_TOUCH_PX
              : SINGLE_TAP_MOVE_MOUSE_PX;

          if (
            this.altTapCandidate &&
            isValidButton &&
            this.maxMoveDist <= moveLimit &&
            dt <= SINGLE_TAP_MAX_MS
          ) {
            // ALT + tap toggles Object Mode / Edit Mode once per gesture
            this.episodeInvalidated = true;
            this.lastTap = null;
            this.callbacks.onAltTap?.();
          } else {
            const tapEnabled =
              e.pointerType !== 'touch' || this.config.oneFingerTapSelect;

            if (
              isValidButton &&
              tapEnabled &&
              this.maxMoveDist <= moveLimit &&
              dt <= SINGLE_TAP_MAX_MS &&
              !effMods.alt &&
              (!effMods.ctrl || effMods.shift)
            ) {
              this.episodeInvalidated = true;
              // Record tap for potential Double-Tap + Hold & Drag on next rapid press
              this.lastTap = {
                time: now,
                x: e.clientX,
                y: e.clientY,
                pointerType: e.pointerType,
              };
              this.callbacks.onSingleTap(
                e.clientX,
                e.clientY,
                e.pointerType,
                effMods,
                e.shiftKey,
              );
            } else {
              this.lastTap = null;
            }
          }
        } else if (this.peakCount === 2) {
          this.lastTap = null;
          if (
            this.config.twoFingerUndo &&
            this.maxMoveDist <= TWO_FINGER_TAP_MOVE_PX &&
            dt <= TWO_FINGER_TAP_MAX_MS
          ) {
            this.episodeInvalidated = true;
            this.callbacks.onTwoFingerTap();
          }
        } else if (this.peakCount === 3) {
          this.lastTap = null;
          if (
            this.config.threeFingerRedo &&
            this.maxMoveDist <= THREE_FINGER_TAP_MOVE_PX &&
            dt <= THREE_FINGER_TAP_MAX_MS
          ) {
            this.episodeInvalidated = true;
            this.callbacks.onThreeFingerTap();
          }
        }
      } else {
        this.lastTap = null;
      }

      this.resetEpisode();
    } else {
      this.callbacks.onTouchNavigationChange(
        this.pointers,
        this.getEffectiveModifiers(e),
        this.isBoxSelectBlockingOrbit(),
      );
    }
  };

  private handlePointerCancel = (e: PointerEvent) => {
    if (this.disposed) return;

    if (this.modalDragState && this.modalDragState.pointerId === e.pointerId) {
      this.pointers.delete(e.pointerId);
      this.cancelModalDrag(true);
      this.lastTap = null;
      this.resetEpisode();
      return;
    }

    if (this.trackballState && this.trackballState.pointerId === e.pointerId) {
      this.pointers.delete(e.pointerId);
      this.cancelTrackball(true);
      this.lastTap = null;
      this.resetEpisode();
      return;
    }

    if (this.boxSelectArmed && this.boxSelectArmed.pointerId === e.pointerId) {
      this.pointers.delete(e.pointerId);
      this.cancelBoxSelect(true);
      this.lastTap = null;
      this.resetEpisode();
      return;
    }

    this.pointers.delete(e.pointerId);
    this.clearLongPressTimer();
    this.lastTap = null;

    if (
      this.shiftHoldPointerId === e.pointerId ||
      this.pointers.size === 0
    ) {
      this.deactivateShiftHold(true);
    } else if (this.secondaryTapCandidate?.id === e.pointerId) {
      this.secondaryTapCandidate = null;
    }

    this.episodeInvalidated = true;
    this.callbacks.onTouchNavigationChange(
      this.pointers,
      this.getEffectiveModifiers(e),
      this.isBoxSelectBlockingOrbit(),
    );
    if (this.pointers.size === 0) {
      this.resetEpisode();
    }
  };

  public dispose(): void {
    this.disposed = true;
    this.clearLongPressTimer();
    this.clearShiftHoldTimer();
    if (this.modalDragState) {
      this.releaseCaptureSafely(this.modalDragState.pointerId);
      this.modalDragState = null;
    }
    if (this.trackballState) {
      this.releaseCaptureSafely(this.trackballState.pointerId);
      this.trackballState = null;
    }
    if (this.boxSelectArmed) {
      this.releaseCaptureSafely(this.boxSelectArmed.pointerId);
      this.boxSelectArmed = null;
    }
    this.pointers.clear();
    this.element.removeEventListener('pointerdown', this.handlePointerDown);
    this.element.removeEventListener('pointermove', this.handlePointerMove);
    this.element.removeEventListener('pointerup', this.handlePointerUp);
    this.element.removeEventListener('pointercancel', this.handlePointerCancel);
    this.element.removeEventListener('contextmenu', this.handleContextMenu);
    window.removeEventListener('blur', this.handleWindowBlur);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
  }
}
