import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkspace, updateChange } from '../src/domain/operations';
import {
  composeClientMessage,
  copyClientResponse,
  messagePlaceholders,
  MESSAGE_TEMPLATES,
} from '../src/toolkit/messages';
import { LOGO_MAX_BYTES, prepareLogo } from '../src/toolkit/branding';

afterEach(() => vi.unstubAllGlobals());
describe('actual-data client response composer', () => {
  it('substitutes approved public fields using the persisted default template and excludes private data', () => {
    const w = createWorkspace();
    w.clients[0].notes = 'PRIVATE-CLIENT-NOTE';
    const message = composeClientMessage(w, w.changes[0]);
    expect(message.unknownTokens).toEqual([]);
    expect(message.text).toContain('Harbor Studio');
    expect(message.text).toContain('Harbor / Website');
    expect(message.text).toContain('$800.00');
    expect(message.text).toContain('no recorded current-revision approval');
    expect(message.text).not.toContain('PRIVATE-CLIENT-NOTE');
    expect(message.text).not.toContain('$65');
    expect(message.text).not.toContain('$520');
    expect(message.text).not.toContain('35%');
    expect(w.agency.messageTemplates).toEqual(MESSAGE_TEMPLATES);
  });
  it('uses editable persisted templates and only substitutes whitelisted tokens without evaluation', () => {
    const w = createWorkspace();
    w.agency.messageTemplates = {
      ...MESSAGE_TEMPLATES,
      quote: 'For {{project_name}}, {{fee}}. Unknown {{hours}} and {{constructor}}.',
    };
    const message = composeClientMessage(w, w.changes[0]);
    expect(message.text).toContain('For Harbor / Website, $800.00');
    expect(message.unknownTokens).toEqual(['hours', 'constructor']);
    expect(message.text).toContain('{{hours}}');
    expect(message.text).toContain('{{constructor}}');
  });
  it('makes deferral noncommittal and retains an explicit credit direction', () => {
    let w = createWorkspace();
    w = updateChange(w, w.changes[0].id, { route: 'Defer' });
    expect(composeClientMessage(w, w.changes[0]).text).toContain(
      'no delivery, date or fee commitment',
    );
    w = updateChange(w, w.changes[0].id, {
      route: 'Quote',
      fee: '0',
      credit: '100',
      creditReason: 'Agreed client credit',
    });
    expect(composeClientMessage(w, w.changes[0]).text).toContain('Credit $100.00');
  });

  it('cannot claim another response or zero fee while the active decision is a quote', () => {
    const w = createWorkspace(),
      before = structuredClone(w);
    expect(() => composeClientMessage(w, w.changes[0], 'absorb')).toThrow(/change workspace/);
    expect(() => composeClientMessage(w, w.changes[0], 'defer')).toThrow(/change workspace/);
    expect(composeClientMessage(w, w.changes[0], 'followup').text).toContain(
      'no recorded current-revision approval',
    );
    expect(w).toEqual(before);
  });

  it('keeps malformed or new edited placeholders visible rather than evaluating them', () => {
    const w = createWorkspace(),
      message = composeClientMessage(
        w,
        w.changes[0],
        'quote',
        '{{ client_name }} / {{client.address}} / {{RATE}} / {{__proto__}}',
      );
    expect(message.text).toBe('Harbor Studio / {{client.address}} / {{RATE}} / {{__proto__}}');
    expect(message.unknownTokens).toEqual(['client.address', 'RATE', '__proto__']);
    expect(messagePlaceholders(`${message.text} / {{fee}} / {{RATE}}`)).toEqual([
      'client.address',
      'RATE',
      '__proto__',
      'fee',
    ]);
  });

  it('reports missing or denied clipboard access without throwing or changing content', async () => {
    vi.stubGlobal('navigator', {});
    expect(await copyClientResponse('Public client response')).toBe(false);
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    expect(await copyClientResponse('Public client response')).toBe(false);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await copyClientResponse('Public client response')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('Public client response');
  });
});

describe('logo upload validation and proportional fitting', () => {
  const pngBytes = () => {
    const bytes = new Uint8Array(33);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    bytes.set([73, 72, 68, 82], 12);
    const view = new DataView(bytes.buffer);
    view.setUint32(8, 13);
    view.setUint32(16, 1200);
    view.setUint32(20, 400);
    return bytes;
  };
  it('rejects SVG, oversized and mislabeled files before decoding', async () => {
    await expect(
      prepareLogo(new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' })),
    ).rejects.toThrow(/PNG, JPEG/);
    await expect(
      prepareLogo(
        new File([new Uint8Array(LOGO_MAX_BYTES + 1)], 'large.png', { type: 'image/png' }),
      ),
    ).rejects.toThrow(/2 MiB/);
    await expect(
      prepareLogo(new File(['not-an-image'], 'wrong.png', { type: 'image/png' })),
    ).rejects.toThrow(/contents/);
  });
  it('rejects decoded invalid dimensions/aspect and closes resources', async () => {
    const close = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 5000, height: 64, close }),
    );
    await expect(
      prepareLogo(new File([pngBytes()], 'logo.png', { type: 'image/png' })),
    ).rejects.toThrow(/4096/);
    expect(close).toHaveBeenCalledOnce();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 2048, height: 64, close }),
    );
    await expect(
      prepareLogo(new File([pngBytes()], 'logo.png', { type: 'image/png' })),
    ).rejects.toThrow(/aspect ratio/);
  });
  it('fits a decoded valid logo proportionally using PNG normalization', async () => {
    const close = vi.fn(),
      drawImage = vi.fn(),
      canvas = {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage }),
        toDataURL: vi.fn().mockReturnValue('data:image/png;base64,normalized'),
      };
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 1200, height: 400, close }),
    );
    vi.stubGlobal('document', { createElement: () => canvas });
    expect(await prepareLogo(new File([pngBytes()], 'logo.png', { type: 'image/png' }))).toBe(
      'data:image/png;base64,normalized',
    );
    expect(canvas.width).toBe(600);
    expect(canvas.height).toBe(200);
    expect(drawImage).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
});
