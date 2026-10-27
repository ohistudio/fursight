"""Make upstream YOLOX run on Apple Silicon (MPS) without editing its source.

YOLOX assumes NVIDIA throughout — CUDA streams in the data prefetcher,
`torch.cuda.FloatTensor` as a device-type marker, `.cuda()` calls in the
SimOTA matcher. Rather than fork the repo (which would muddy both updates and
the licence provenance), everything is monkey-patched at import time.

Import this BEFORE importing anything from yolox.
"""
import torch
from loguru import logger

DEVICE = "mps" if torch.backends.mps.is_available() else "cpu"


class _DeviceFloatTensor:
    """Stands in for torch.cuda.FloatTensor, which YOLOX uses two ways:
    as a constructor, and as a marker passed to Tensor.type()."""
    dtype = torch.float32

    def __new__(cls, *args, **kwargs):
        if len(args) == 1 and isinstance(args[0], (list, tuple)):
            return torch.tensor(args[0], dtype=cls.dtype, device=DEVICE)
        return torch.zeros(*args, dtype=cls.dtype, device=DEVICE)


class _DeviceHalfTensor(_DeviceFloatTensor):
    dtype = torch.float16


def apply():
    # ── .cuda() -> .to(mps) ────────────────────────────────────────────
    torch.Tensor.cuda = lambda self, *a, **k: self.to(DEVICE)
    torch.nn.Module.cuda = lambda self, *a, **k: self.to(DEVICE)

    # ── CUDA stream machinery: no MPS equivalent, and not needed ───────
    torch.Tensor.record_stream = lambda self, *a, **k: None

    # ── device housekeeping ────────────────────────────────────────────
    torch.cuda.set_device = lambda *a, **k: None
    torch.cuda.empty_cache = (torch.mps.empty_cache
                              if DEVICE == "mps" else (lambda: None))
    torch.cuda.max_memory_allocated = (
        torch.mps.driver_allocated_memory if DEVICE == "mps" else (lambda: 0))
    torch.cuda.synchronize = (torch.mps.synchronize
                              if DEVICE == "mps" else (lambda *a, **k: None))

    # ── tensor-type markers ────────────────────────────────────────────
    torch.cuda.FloatTensor = _DeviceFloatTensor
    torch.cuda.HalfTensor = _DeviceHalfTensor

    _orig_type = torch.Tensor.type

    # YOLOX round-trips types as strings — `x.type(xin[0].type())`. On MPS the
    # getter yields 'torch.mps.FloatTensor', which torch cannot parse back, so
    # the string form has to be intercepted and mapped to (device, dtype).
    _STR_DTYPES = {
        "FloatTensor": torch.float32, "HalfTensor": torch.float16,
        "DoubleTensor": torch.float64, "LongTensor": torch.int64,
        "IntTensor": torch.int32, "ByteTensor": torch.uint8,
        "BoolTensor": torch.bool, "ShortTensor": torch.int16,
        "CharTensor": torch.int8,
    }

    def _type(self, dtype=None, non_blocking=False, **kw):
        if dtype is _DeviceFloatTensor:
            return self.to(DEVICE, torch.float32)
        if dtype is _DeviceHalfTensor:
            return self.to(DEVICE, torch.float16)
        if isinstance(dtype, str) and (".mps." in dtype or ".cuda." in dtype):
            base = dtype.rsplit(".", 1)[-1]
            return self.to(DEVICE, _STR_DTYPES.get(base, torch.float32))
        if dtype is None:
            return _orig_type(self)
        return _orig_type(self, dtype, non_blocking, **kw)

    torch.Tensor.type = _type

    logger.info(f"MPS patch applied — training device: {DEVICE}")
    return DEVICE


class SimplePrefetcher:
    """Replaces YOLOX's CUDA-stream DataPrefetcher.

    MPS has no stream API, so there is nothing to overlap — just pull the
    batch and move it across. Matches the upstream (input, target) contract,
    including returning (None, None) when the loader is exhausted.
    """

    def __init__(self, loader):
        self.loader = iter(loader)

    def next(self):
        try:
            inp, target, _, _ = next(self.loader)
        except StopIteration:
            return None, None
        return inp.to(DEVICE, non_blocking=True), target.to(DEVICE,
                                                            non_blocking=True)
