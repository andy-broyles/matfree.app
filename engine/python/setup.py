"""
MatFree Python Package Setup
"""

from setuptools import setup, find_packages

setup(
    name="matfree",
    version="0.1.0",
    description="MatFree - Open-Source Computing Environment",
    long_description=open("../README.md").read() if __import__("os").path.exists("../README.md") else "",
    long_description_content_type="text/markdown",
    author="MatFree Contributors",
    license="MIT",
    url="https://github.com/matfree/matfree",
    packages=find_packages(),
    python_requires=">=3.8",
    install_requires=[
        "numpy>=1.20",
    ],
    extras_require={
        "plotting": ["matplotlib>=3.5"],
        "symbolic": ["sympy>=1.10"],
        "image": ["opencv-python>=4.5"],
        "all": [
            "matplotlib>=3.5",
            "sympy>=1.10",
            "opencv-python>=4.5",
            "scipy>=1.8",
        ],
    },
    entry_points={
        "console_scripts": [
            "matfree-py=matfree:repl",
        ],
    },
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Science/Research",
        "Intended Audience :: Education",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: C++",
        "Topic :: Scientific/Engineering :: Mathematics",
        "Operating System :: OS Independent",
    ],
)
