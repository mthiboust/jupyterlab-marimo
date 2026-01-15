"""
jupyterlab-marimo - A JupyterLab extension to open Marimo files
"""

from ._version import __version__
from .jupyter_marimo_proxy import setup_marimoserver


def _jupyter_labextension_paths():
    """Return the paths for the labextension."""
    return [{"src": "labextension", "dest": "jupyterlab-marimo"}]


def _jupyter_server_extension_points():
    """Return the server extension points for this package."""
    return [{"module": "jupyterlab_marimo"}]


def _load_jupyter_server_extension(server_app):
    """
    Load the Jupyter server extension.

    Registers the API handlers for file conversion between Jupyter
    and Marimo notebook formats.

    Args:
        server_app: The Jupyter server application instance.
    """
    from .handlers import setup_handlers

    setup_handlers(server_app.web_app)
    server_app.log.info("jupyterlab-marimo server extension loaded.")


__all__ = [
    "__version__",
    "setup_marimoserver",
    "_jupyter_labextension_paths",
    "_jupyter_server_extension_points",
    "_load_jupyter_server_extension",
]
