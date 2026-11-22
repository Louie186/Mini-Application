"""Builds SheetExport.dyn from SheetExport.py so the graph and the code never drift.

Run:  python build_dyn.py
"""
import json
import os
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))


def gid():
    return uuid.uuid4().hex


def port(name, desc):
    return {"Id": gid(), "Name": name, "Description": desc, "UsingDefaultValue": False,
            "Level": 2, "UseLevels": False, "KeepListStructure": False}


def input_node(concrete, node_type, value, desc, extra=None):
    n = {"ConcreteType": concrete, "Id": gid(), "NodeType": node_type,
         "Inputs": [], "Outputs": [port("", desc)], "Replication": "Disabled",
         "Description": desc, "InputValue": value}
    if extra:
        n.update(extra)
    return n


code = open(os.path.join(HERE, "SheetExport.py"), encoding="utf-8").read()

labels = ["Drawing list (.csv)", "Output folder", "Naming rule",
          "DWG export setup (blank = default)", "PDF export setup (blank = default)",
          "Export? (False = dry run)"]

inputs = [
    input_node("CoreNodeModels.Input.Filename, CoreNodeModels", "ExtensionNode",
               "C:\\BIMTools\\revit-export\\DrawingList_template.csv", "File Path",
               {"HintPath": "C:\\BIMTools\\revit-export\\DrawingList_template.csv"}),
    input_node("CoreNodeModels.Input.Directory, CoreNodeModels", "ExtensionNode",
               "C:\\BIMTools\\Exports", "Directory Path",
               {"HintPath": "C:\\BIMTools\\Exports"}),
    input_node("CoreNodeModels.Input.StringInput, CoreNodeModels", "StringInputNode",
               "{SheetNumber}_{SheetName}", "Creates a string."),
    input_node("CoreNodeModels.Input.StringInput, CoreNodeModels", "StringInputNode",
               "", "Creates a string."),
    input_node("CoreNodeModels.Input.StringInput, CoreNodeModels", "StringInputNode",
               "", "Creates a string."),
    input_node("CoreNodeModels.Input.BoolSelector, CoreNodeModels", "BooleanInputNode",
               False, "Enables selection between True and False"),
]

py = {
    "ConcreteType": "PythonNodeModels.PythonNode, PythonNodeModels",
    "Code": code,
    "Engine": "CPython3",
    "EngineName": "CPython3",
    "VariableInputPorts": True,
    "Id": gid(),
    "NodeType": "PythonScriptNode",
    "Inputs": [port("IN[%d]" % i, "Input #%d" % i) for i in range(6)],
    "Outputs": [port("OUT", "Result of the python script")],
    "Replication": "Disabled",
    "Description": "Runs an embedded Python script.",
}

nodes = inputs + [py]
connectors = [{"Start": inputs[i]["Outputs"][0]["Id"], "End": py["Inputs"][i]["Id"],
               "Id": gid(), "IsHidden": "False"} for i in range(6)]

node_views = []
for i, n in enumerate(inputs):
    node_views.append({"Id": n["Id"], "Name": labels[i], "IsSetAsInput": True,
                       "IsSetAsOutput": False, "Excluded": False, "ShowGeometry": True,
                       "X": 0.0, "Y": 160.0 * i})
node_views.append({"Id": py["Id"], "Name": "Sheet Export", "IsSetAsInput": False,
                   "IsSetAsOutput": True, "Excluded": False, "ShowGeometry": True,
                   "X": 700.0, "Y": 300.0})

dyn = {
    "Uuid": str(uuid.uuid4()),
    "IsCustomNode": False,
    "Description": "Exports the sheets listed in a CSV drawing list from the open Revit model to PDF/DWG.",
    "Name": "SheetExport",
    "ElementResolver": {"ResolutionMap": {}},
    "Inputs": [],
    "Outputs": [],
    "Nodes": nodes,
    "Connectors": connectors,
    "Dependencies": [],
    "NodeLibraryDependencies": [],
    "Bindings": [],
    "View": {
        "Dynamo": {"ScaleFactor": 1.0, "HasRunWithoutCrash": False, "IsVisibleInDynamoLibrary": True,
                   "Version": "3.0.0.0", "RunType": "Manual", "RunPeriod": "1000"},
        "Camera": {"Name": "Background Preview", "EyeX": -17.0, "EyeY": 24.0, "EyeZ": 50.0,
                   "LookX": 12.0, "LookY": -13.0, "LookZ": -58.0, "UpX": 0.0, "UpY": 1.0, "UpZ": 0.0},
        "ConnectorPins": [],
        "NodeViews": node_views,
        "Annotations": [],
        "X": 50.0, "Y": 50.0, "Zoom": 0.8,
    },
}

with open(os.path.join(HERE, "SheetExport.dyn"), "w", encoding="utf-8") as f:
    json.dump(dyn, f, indent=2)
print("SheetExport.dyn written")
