import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceQuickControls } from './WorkspaceQuickControls';
import { getNextLeftToolbarDisplayMode } from '../core/project/storage';

describe('WorkspaceQuickControls', () => {
  it('cycles the toolbar through expanded, compact, and hidden states', () => {
    expect(getNextLeftToolbarDisplayMode('expanded')).toBe('compact');
    expect(getNextLeftToolbarDisplayMode('compact')).toBe('hidden');
    expect(getNextLeftToolbarDisplayMode('hidden')).toBe('expanded');
  });

  it('only offers Object and Edit modes', () => {
    render(
      <WorkspaceQuickControls
        activeAppId="modeler"
        toolbarMode="expanded"
        toolbarControlsId="modeler-toolbar"
        workMode="object"
        canEdit
        onToggleToolbar={vi.fn()}
        onToggleWorkMode={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('work-mode-switcher'));

    const options = within(screen.getByTestId('work-mode-menu')).getAllByRole(
      'menuitemradio',
    );
    expect(options).toHaveLength(2);
    expect(options.map((option) => option.textContent)).toEqual([
      expect.stringContaining('Modo Objeto'),
      expect.stringContaining('Modo Edición'),
    ]);
  });

  it('maps Sculpt Edit mode to the existing sculpt work mode', () => {
    const onToggleWorkMode = vi.fn();
    render(
      <WorkspaceQuickControls
        activeAppId="sculpt"
        toolbarMode="expanded"
        toolbarControlsId="sculpt-toolbar"
        workMode="object"
        canEdit
        onToggleToolbar={vi.fn()}
        onToggleWorkMode={onToggleWorkMode}
      />,
    );

    fireEvent.click(screen.getByTestId('work-mode-switcher'));
    fireEvent.click(screen.getByTestId('work-mode-option-edit'));

    expect(onToggleWorkMode).toHaveBeenCalledWith('sculpt');
  });

  it('disables Edit mode when no editable mesh is available', () => {
    render(
      <WorkspaceQuickControls
        activeAppId="uvs"
        toolbarMode="expanded"
        toolbarControlsId="uv-toolbar"
        workMode="object"
        canEdit={false}
        onToggleToolbar={vi.fn()}
        onToggleWorkMode={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('work-mode-switcher'));

    expect(screen.getByTestId('work-mode-option-edit')).toBeDisabled();
  });
});
