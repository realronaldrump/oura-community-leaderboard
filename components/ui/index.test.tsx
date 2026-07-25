import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dialog, SegmentedControl } from './index';

afterEach(cleanup);

describe('Dialog', () => {
  it('keeps its focus lifecycle intact when onClose changes while open', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open details';
    document.body.appendChild(trigger);
    trigger.focus();
    const triggerFocus = vi.spyOn(trigger, 'focus');
    const firstClose = vi.fn();
    const latestClose = vi.fn();

    const { rerender } = render(
      <Dialog isOpen title="Details" onClose={firstClose}>
        <button type="button">Dialog action</button>
      </Dialog>,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /close details/i })).toHaveFocus());
    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <Dialog isOpen title="Details" onClose={latestClose}>
        <button type="button">Dialog action</button>
      </Dialog>,
    );

    expect(triggerFocus).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(firstClose).not.toHaveBeenCalled();
    expect(latestClose).toHaveBeenCalledTimes(1);

    rerender(
      <Dialog isOpen={false} title="Details" onClose={latestClose}>
        <button type="button">Dialog action</button>
      </Dialog>,
    );

    expect(triggerFocus).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe('');
    trigger.remove();
  });

  it('blocks every user dismissal while busy and restores them without remounting', async () => {
    const onClose = vi.fn();
    const { container, rerender } = render(
      <Dialog isOpen title="Saving changes" onClose={onClose} busy>
        <button type="button">Working</button>
      </Dialog>,
    );

    const dialog = screen.getByRole('dialog', { name: /saving changes/i });
    const backdrop = container.querySelector<HTMLElement>('.ui-dialog-backdrop');

    expect(dialog).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('button', { name: /close saving changes/i })).not.toBeInTheDocument();
    expect(backdrop).not.toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.mouseDown(backdrop!);
    expect(onClose).not.toHaveBeenCalled();

    rerender(
      <Dialog isOpen title="Saving changes" onClose={onClose}>
        <button type="button">Working</button>
      </Dialog>,
    );

    expect(dialog).not.toHaveAttribute('aria-busy');
    expect(screen.getByRole('button', { name: /close saving changes/i })).toBeInTheDocument();

    fireEvent.mouseDown(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('supports a non-busy, non-dismissible modal state', () => {
    const onClose = vi.fn();
    const { container } = render(
      <Dialog isOpen title="Required choice" onClose={onClose} dismissible={false}>
        <button type="button">Choose</button>
      </Dialog>,
    );

    const dialog = screen.getByRole('dialog', { name: /required choice/i });
    expect(dialog).not.toHaveAttribute('aria-busy');
    expect(screen.queryByRole('button', { name: /close required choice/i })).not.toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.mouseDown(container.querySelector<HTMLElement>('.ui-dialog-backdrop')!);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('SegmentedControl', () => {
  it('exposes a labeled button group with pressed selection state', () => {
    const onChange = vi.fn();

    render(
      <SegmentedControl
        label="Time range"
        value="week"
        options={[
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
        ]}
        onChange={onChange}
      />,
    );

    expect(screen.getByRole('group', { name: 'Time range' })).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Week' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Month' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Month' }));
    expect(onChange).toHaveBeenCalledWith('month');
  });
});
