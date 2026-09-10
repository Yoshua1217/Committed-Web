package com.committed.app;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.common.model.DownloadConditions;
import com.google.mlkit.common.model.RemoteModelManager;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognition;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognitionModel;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognitionModelIdentifier;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognizer;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognizerOptions;
import com.google.mlkit.vision.digitalink.recognition.Ink;
import org.json.JSONArray;
import org.json.JSONObject;

/** Recognition stays on-device; only the language model is downloaded. */
@CapacitorPlugin(name = "HandwritingRecognition")
public class HandwritingRecognitionPlugin extends Plugin {
    @PluginMethod
    public void recognize(PluginCall call) {
        try {
            DigitalInkRecognitionModelIdentifier identifier = DigitalInkRecognitionModelIdentifier.fromLanguageTag(call.getString("language", "en-US"));
            if (identifier == null) { call.reject("This handwriting language is not supported."); return; }
            JSONArray strokes = call.getArray("strokes", new JSArray());
            if (strokes.length() == 0) { call.reject("Select handwriting first."); return; }
            Ink.Builder ink = Ink.builder();
            for (int i = 0; i < strokes.length(); i++) {
                JSONArray points = strokes.getJSONArray(i);
                if (points.length() == 0) continue;
                Ink.Stroke.Builder stroke = Ink.Stroke.builder();
                for (int j = 0; j < points.length(); j++) {
                    JSONObject point = points.getJSONObject(j);
                    stroke.addPoint(Ink.Point.create((float) point.getDouble("x"), (float) point.getDouble("y"), point.getLong("t")));
                }
                ink.addStroke(stroke.build());
            }
            DigitalInkRecognitionModel model = DigitalInkRecognitionModel.builder(identifier).build();
            RemoteModelManager.getInstance().download(model, new DownloadConditions.Builder().build())
                .addOnSuccessListener(ignored -> {
                    DigitalInkRecognizer recognizer = DigitalInkRecognition.getClient(DigitalInkRecognizerOptions.builder(model).build());
                    recognizer.recognize(ink.build()).addOnSuccessListener(result -> {
                        JSArray candidates = new JSArray();
                        result.getCandidates().forEach(candidate -> candidates.put(candidate.getText()));
                        JSObject response = new JSObject(); response.put("candidates", candidates);
                        recognizer.close(); call.resolve(response);
                    }).addOnFailureListener(error -> { recognizer.close(); call.reject("Handwriting could not be recognized.", error); });
                }).addOnFailureListener(error -> call.reject("Connect to the internet once to download the handwriting language model.", error));
        } catch (Exception error) { call.reject("The handwriting selection could not be read.", error); }
    }
}
