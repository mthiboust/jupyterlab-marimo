import marimo

__generated_with = "0.19.2"
app = marimo.App()


@app.cell
def _():
    import marimo as mo

    return (mo,)


@app.cell
def _(mo):
    mo.md("""
    # Welcome to Marimo!

    This is an example Marimo notebook file (`.mo.py`).

    When you double-click this file in JupyterLab, it should open in the Marimo editor
    thanks to the jupyterlab-marimo extension.
    """)
    return


@app.cell
def _(mo):
    slider = mo.ui.slider(1, 10, value=5, label="Pick a number:")
    slider
    return (slider,)


@app.cell
def _(mo, slider):
    mo.md(f"""
    You selected: **{slider.value}**
    """)
    return


@app.cell
def _():
    import matplotlib.pyplot as plt
    import numpy as np

    x = np.linspace(0, 2 * np.pi, 100)
    y = np.sin(x)

    plt.figure(figsize=(10, 6))
    plt.plot(x, y)
    plt.title("Sine Wave")
    plt.xlabel("x")
    plt.ylabel("sin(x)")
    plt.grid(True)
    plt.show()
    return


if __name__ == "__main__":
    app.run()
