"""
jupyterlab-marimo - A JupyterLab extension to open Marimo files
"""

from ._version import __version__
from .jupyter_marimo_proxy import setup_marimoserver


def _jupyter_labextension_paths():
    return [{"src": "labextension", "dest": "jupyterlab-marimo"}]


__all__ = ["__version__", "setup_marimoserver", "_jupyter_labextension_paths"]
