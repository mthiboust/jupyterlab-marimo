"""
Jupyter Server extension handlers for jupyterlab-marimo.

Provides REST API endpoints for file conversion between Jupyter notebooks
and Marimo notebooks.
"""

import json
import os
import subprocess
from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join
import tornado.web


def _validate_path(path):
    """
    Validate a file path to prevent CLI argument injection attacks.

    Ensures the path doesn't start with '-' which could be interpreted
    as CLI arguments/options by the marimo tool.

    Note: This is a targeted security check, not comprehensive path validation.
    The Jupyter server already handles path traversal and access control.

    Args:
        path: The file path to validate.

    Returns:
        Tuple of (is_valid: bool, error_message: str or None)
    """
    if not path:
        return False, "Path cannot be empty"

    # Prevent argument injection by rejecting paths that start with '-'
    # This prevents paths like "--evil-arg" being interpreted as CLI options
    basename = os.path.basename(path)
    if basename.startswith("-"):
        return False, "File names starting with '-' are not allowed"

    # Also check if any path component starts with '-'
    for part in path.split(os.sep):
        if part.startswith("-"):
            return False, "Path components starting with '-' are not allowed"

    return True, None


def _convert_to_marimo(source_path, output_path):
    """
    Convert a Jupyter notebook to Marimo format.

    Args:
        source_path: Absolute path to the source .ipynb file.
        output_path: Absolute path for the output .mo.py file.

    Returns:
        Tuple of (success: bool, error_message: str or None)
    """
    try:
        result = subprocess.run(
            ["marimo", "convert", source_path, "-o", output_path],
            capture_output=True,
            text=True,
            timeout=30,
        )

        if result.returncode != 0:
            error_msg = result.stderr.strip() if result.stderr else "Unknown conversion error"
            return False, f"Conversion failed: {error_msg}"

        return True, None

    except FileNotFoundError:
        return False, "marimo CLI not found. Please ensure marimo is installed."
    except subprocess.TimeoutExpired:
        return False, "Conversion timed out after 30 seconds"
    except Exception as e:
        return False, f"Conversion error: {str(e)}"


def _convert_from_marimo(source_path, output_path):
    """
    Convert a Marimo notebook to Jupyter ipynb format.

    Args:
        source_path: Absolute path to the source .mo.py file.
        output_path: Absolute path for the output .ipynb file.

    Returns:
        Tuple of (success: bool, error_message: str or None)
    """
    try:
        result = subprocess.run(
            ["marimo", "export", "ipynb", source_path, "-o", output_path],
            capture_output=True,
            text=True,
            timeout=30,
        )

        if result.returncode != 0:
            error_msg = result.stderr.strip() if result.stderr else "Unknown export error"
            return False, f"Export failed: {error_msg}"

        return True, None

    except FileNotFoundError:
        return False, "marimo CLI not found. Please ensure marimo is installed."
    except subprocess.TimeoutExpired:
        return False, "Export timed out after 30 seconds"
    except Exception as e:
        return False, f"Export error: {str(e)}"


class ConvertHandler(APIHandler):
    """
    Handler for converting files between Jupyter and Marimo formats.

    POST /jupyterlab-marimo/convert
    Body: {"sourcePath": string, "direction": "to_marimo" | "from_marimo"}
    Response: {"success": bool, "outputPath": string, "error"?: string}
    """

    @tornado.web.authenticated
    def post(self):
        """Handle conversion request."""
        try:
            data = self.get_json_body()
            source_path = data.get("sourcePath")
            direction = data.get("direction")

            # Validate input
            if not source_path:
                self.set_status(400)
                self.finish(json.dumps({"success": False, "error": "sourcePath is required"}))
                return

            if direction not in ("to_marimo", "from_marimo"):
                self.set_status(400)
                self.finish(json.dumps({
                    "success": False,
                    "error": "direction must be 'to_marimo' or 'from_marimo'"
                }))
                return

            # Validate path to prevent CLI argument injection
            is_valid, validation_error = _validate_path(source_path)
            if not is_valid:
                self.set_status(400)
                self.finish(json.dumps({
                    "success": False,
                    "error": validation_error
                }))
                return

            # Get the root directory from Jupyter server contents manager
            contents_manager = self.settings.get("contents_manager")
            if contents_manager and hasattr(contents_manager, "root_dir"):
                root_dir = contents_manager.root_dir
            else:
                root_dir = os.getcwd()

            # Resolve the full path
            full_source_path = os.path.join(root_dir, source_path)

            # Validate source file exists
            if not os.path.isfile(full_source_path):
                self.set_status(400)
                self.finish(json.dumps({
                    "success": False,
                    "error": f"Source file not found: {source_path}"
                }))
                return

            # Determine output path
            if direction == "to_marimo":
                # .ipynb -> .mo.py
                if not source_path.endswith(".ipynb"):
                    self.set_status(400)
                    self.finish(json.dumps({
                        "success": False,
                        "error": "Source file must be a .ipynb file for to_marimo conversion"
                    }))
                    return
                output_path = source_path[:-6] + ".mo.py"  # Remove .ipynb, add .mo.py
                full_output_path = os.path.join(root_dir, output_path)
                success, error = _convert_to_marimo(full_source_path, full_output_path)
            else:
                # .mo.py -> .ipynb
                if not source_path.endswith(".mo.py"):
                    self.set_status(400)
                    self.finish(json.dumps({
                        "success": False,
                        "error": "Source file must be a .mo.py file for from_marimo conversion"
                    }))
                    return
                output_path = source_path[:-6] + ".ipynb"  # Remove .mo.py, add .ipynb
                full_output_path = os.path.join(root_dir, output_path)
                success, error = _convert_from_marimo(full_source_path, full_output_path)

            if success:
                self.finish(json.dumps({
                    "success": True,
                    "outputPath": output_path
                }))
            else:
                self.set_status(500)
                self.finish(json.dumps({
                    "success": False,
                    "error": error
                }))

        except json.JSONDecodeError:
            self.set_status(400)
            self.finish(json.dumps({"success": False, "error": "Invalid JSON body"}))
        except Exception as e:
            self.set_status(500)
            self.finish(json.dumps({"success": False, "error": str(e)}))


def setup_handlers(web_app):
    """Register the API handlers with the Jupyter server application."""
    host_pattern = ".*$"
    base_url = web_app.settings["base_url"]

    # Route pattern for the convert endpoint
    convert_pattern = url_path_join(base_url, "jupyterlab-marimo", "convert")

    handlers = [
        (convert_pattern, ConvertHandler),
    ]

    web_app.add_handlers(host_pattern, handlers)
