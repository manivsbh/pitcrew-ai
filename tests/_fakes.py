"""Shared test fakes: synthetic recording, stub store/docs. No network."""

import numpy as np

from backend.app.analysis import Channel, Recording


def synth_recording(speed_rpm: float | None = 1500.0, flat: bool = False,
                    nonfinite: bool = False):
    fs = 1000.0
    t = np.arange(4000) / fs
    vib = np.zeros(4000) if flat else np.sin(2 * np.pi * 100 * t)
    if nonfinite:
        vib = vib.copy()
        vib[10] = np.nan
    channels = {"vibration_1": Channel("vibration_1", vib, fs, "g")}
    if speed_rpm is not None:
        channels["speed"] = Channel("speed", np.full(4000, speed_rpm), fs,
                                    "rpm")
    return Recording(path="synthetic", condition="N15_M07_F10",
                     bearing="K000", repetition=1, channels=channels,
                     speed_rpm=speed_rpm)


class FakeStore:
    def __init__(self, rec=None):
        self._rec = rec or synth_recording()

    def agent_view(self, rid):
        if rid != "rec_0001":
            raise KeyError(rid)
        return {"recording_id": rid, "condition": "N15_M07_F10",
                "speed_rpm": 1500.0, "channels": {"vibration_1": {"n": 4000}},
                "quality": []}

    def load(self, rid):
        if rid != "rec_0001":
            raise KeyError(rid)
        return self._rec


class FakeDocs:
    def get(self, topic):
        return {"id": topic, "title": topic, "source_file": f"{topic}.md",
                "text": "excerpt text"}


def refs():
    return {"N15_M07_F10": {"rms": [1.0, 1.1, 0.9], "crest": [3.0, 3.1, 2.9],
                            "kurtosis_excess": [0.1, 0.0, -0.1]}}
