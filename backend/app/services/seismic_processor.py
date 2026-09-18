import os
import numpy as np
from typing import Tuple, Optional
from io import BytesIO
from PIL import Image

try:
    import segyio
    SEGYIO_AVAILABLE = True
except ImportError:
    SEGYIO_AVAILABLE = False

from ..config import get_settings

settings = get_settings()


class SeismicDataProcessor:
    def __init__(self):
        self.data_dir = settings.SEISMIC_DATA_DIR
        os.makedirs(self.data_dir, exist_ok=True)

    def parse_segy_header(self, file_path: str) -> dict:
        if not SEGYIO_AVAILABLE:
            raise RuntimeError("segyio is not available")

        with segyio.open(file_path, "r", ignore_geometry=True) as f:
            binary_header = f.bin
            text_header = f.text[0]

            spec = segyio.spec()
            spec.iline = segyio.tracefield.INLINE_3D
            spec.xline = segyio.tracefield.CROSSLINE_3D

            try:
                f.mmap()
                inlines = sorted(set(f.attributes(segyio.TraceField.INLINE_3D)[:]))
                crosslines = sorted(set(f.attributes(segyio.TraceField.CROSSLINE_3D)[:]))

                if len(inlines) > 1:
                    inline_step = inlines[1] - inlines[0]
                else:
                    inline_step = 1

                if len(crosslines) > 1:
                    crossline_step = crosslines[1] - crosslines[0]
                else:
                    crossline_step = 1

                sample_rate = f.bin[segyio.BinField.Interval] / 1000.0
                num_samples = f.bin[segyio.BinField.Samples]
                depth_start = 0
                depth_end = (num_samples - 1) * sample_rate

                return {
                    "inline_start": min(inlines),
                    "inline_end": max(inlines),
                    "inline_step": inline_step,
                    "crossline_start": min(crosslines),
                    "crossline_end": max(crosslines),
                    "crossline_step": crossline_step,
                    "depth_start": depth_start,
                    "depth_end": depth_end,
                    "depth_step": sample_rate,
                    "num_inlines": len(inlines),
                    "num_crosslines": len(crosslines),
                    "num_depths": num_samples,
                    "sample_count": num_samples,
                    "sample_rate": sample_rate,
                    "trace_count": f.tracecount
                }
            except Exception as e:
                return {
                    "trace_count": f.tracecount,
                    "sample_count": f.bin[segyio.BinField.Samples],
                    "sample_rate": f.bin[segyio.BinField.Interval] / 1000.0,
                    "error": str(e)
                }

    def compute_statistics(self, file_path: str) -> dict:
        if not SEGYIO_AVAILABLE:
            raise RuntimeError("segyio is not available")

        with segyio.open(file_path, "r", ignore_geometry=True) as f:
            f.mmap()

            total_traces = f.tracecount
            chunk_size = 10000
            all_values = []

            for i in range(0, total_traces, chunk_size):
                end_idx = min(i + chunk_size, total_traces)
                traces = f.trace[i:end_idx]
                all_values.append(traces.flatten())
                if len(np.concatenate(all_values)) > 10_000_000:
                    break

            all_values = np.concatenate(all_values)

            return {
                "min_value": float(np.min(all_values)),
                "max_value": float(np.max(all_values)),
                "mean_value": float(np.mean(all_values)),
                "std_value": float(np.std(all_values)),
                "percentile_5": float(np.percentile(all_values, 5)),
                "percentile_95": float(np.percentile(all_values, 95))
            }

    def get_inline_slice(self, file_path: str, inline_index: int) -> np.ndarray:
        if not SEGYIO_AVAILABLE:
            raise RuntimeError("segyio is not available")

        with segyio.open(file_path, "r") as f:
            f.mmap()
            inlines = sorted(set(f.attributes(segyio.TraceField.INLINE_3D)[:]))

            if inline_index not in inlines:
                nearest = inlines[min(range(len(inlines)), key=lambda i: abs(inlines[i] - inline_index))]
                inline_index = nearest

            slice_data = f.iline[inline_index]
            return np.array(slice_data)

    def get_crossline_slice(self, file_path: str, crossline_index: int) -> np.ndarray:
        if not SEGYIO_AVAILABLE:
            raise RuntimeError("segyio is not available")

        with segyio.open(file_path, "r") as f:
            f.mmap()
            crosslines = sorted(set(f.attributes(segyio.TraceField.CROSSLINE_3D)[:]))

            if crossline_index not in crosslines:
                nearest = crosslines[min(range(len(crosslines)), key=lambda i: abs(crosslines[i] - crossline_index))]
                crossline_index = nearest

            slice_data = f.xline[crossline_index]
            return np.array(slice_data)

    def get_depth_slice(self, file_path: str, depth_index: int) -> np.ndarray:
        if not SEGYIO_AVAILABLE:
            raise RuntimeError("segyio is not available")

        with segyio.open(file_path, "r") as f:
            f.mmap()
            # 深度轴是按采样位置索引的，越界必须夹取到 [0, 样本数-1]，
            # 与前端 clampSliceIndex 的判定保持一致，避免拖到上限外直接报错
            num_samples = int(f.bin[segyio.BinField.Samples])
            if num_samples > 0:
                depth_index = min(max(int(depth_index), 0), num_samples - 1)
            slice_data = f.depth_slice[depth_index]
            return np.array(slice_data)

    def get_subvolume(
        self,
        file_path: str,
        inline_range: Tuple[int, int],
        crossline_range: Tuple[int, int],
        depth_range: Tuple[int, int]
    ) -> np.ndarray:
        if not SEGYIO_AVAILABLE:
            raise RuntimeError("segyio is not available")

        with segyio.open(file_path, "r") as f:
            f.mmap()
            inlines = sorted(set(f.attributes(segyio.TraceField.INLINE_3D)[:]))
            crosslines = sorted(set(f.attributes(segyio.TraceField.CROSSLINE_3D)[:]))

            inline_start, inline_end = inline_range
            crossline_start, crossline_end = crossline_range
            depth_start_idx, depth_end_idx = depth_range

            inline_indices = [i for i in inlines if inline_start <= i <= inline_end]
            crossline_indices = [x for x in crosslines if crossline_start <= x <= crossline_end]

            subvolume = np.zeros((len(inline_indices), len(crossline_indices), depth_end_idx - depth_start_idx))

            for i_idx, inline in enumerate(inline_indices):
                inline_data = f.iline[inline]
                for x_idx, crossline in enumerate(crossline_indices):
                    subvolume[i_idx, x_idx, :] = inline_data[crossline_indices.index(crossline), depth_start_idx:depth_end_idx]

            return subvolume

    def generate_thumbnail(
        self,
        slice_data: np.ndarray,
        colormap: str = "seismic",
        min_val: Optional[float] = None,
        max_val: Optional[float] = None
    ) -> BytesIO:
        if min_val is None:
            min_val = np.percentile(slice_data, 5)
        if max_val is None:
            max_val = np.percentile(slice_data, 95)

        # 与前端 getEffectiveValueRange 同一套规则：保证 min <= max，
        # 范围退化（相等/非法）时全部映射为 0，避免除零产生空白/坏图
        if not np.isfinite(min_val):
            min_val = 0.0
        if not np.isfinite(max_val):
            max_val = min_val if min_val != 0 else 1.0
        if min_val > max_val:
            min_val, max_val = max_val, min_val
        if max_val - min_val <= 0:
            normalized = np.zeros_like(slice_data, dtype=np.float64)
        else:
            normalized = np.clip((slice_data - min_val) / (max_val - min_val), 0, 1)

        colormaps = {
            "seismic": self._seismic_colormap,
            "gray": self._gray_colormap,
            "rainbow": self._rainbow_colormap
        }

        cmap_func = colormaps.get(colormap, self._seismic_colormap)
        rgba_data = cmap_func(normalized)

        img = Image.fromarray((rgba_data * 255).astype(np.uint8))
        max_size = 512
        img.thumbnail((max_size, max_size))

        buffer = BytesIO()
        img.save(buffer, format="PNG")
        buffer.seek(0)
        return buffer

    def _seismic_colormap(self, data: np.ndarray) -> np.ndarray:
        h, w = data.shape
        rgba = np.zeros((h, w, 4))

        for i in range(h):
            for j in range(w):
                val = data[i, j]
                if val < 0.5:
                    t = val * 2
                    rgba[i, j] = [0, 0, 1 - t, 1]
                else:
                    t = (val - 0.5) * 2
                    rgba[i, j] = [t, 0, 0, 1]

        return rgba

    def _gray_colormap(self, data: np.ndarray) -> np.ndarray:
        h, w = data.shape
        rgba = np.zeros((h, w, 4))
        rgba[:, :, 0] = data
        rgba[:, :, 1] = data
        rgba[:, :, 2] = data
        rgba[:, :, 3] = 1
        return rgba

    def _rainbow_colormap(self, data: np.ndarray) -> np.ndarray:
        h, w = data.shape
        rgba = np.zeros((h, w, 4))

        for i in range(h):
            for j in range(w):
                val = data[i, j]
                if val < 0.25:
                    t = val / 0.25
                    rgba[i, j] = [0, 0, 0.5 + t * 0.5, 1]
                elif val < 0.5:
                    t = (val - 0.25) / 0.25
                    rgba[i, j] = [0, t, 1, 1]
                elif val < 0.75:
                    t = (val - 0.5) / 0.25
                    rgba[i, j] = [t, 1, 1 - t, 1]
                else:
                    t = (val - 0.75) / 0.25
                    rgba[i, j] = [1, 1 - t * 0.5, 0, 1]

        return rgba


seismic_processor = SeismicDataProcessor()
