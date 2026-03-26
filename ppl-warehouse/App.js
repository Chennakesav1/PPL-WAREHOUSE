import React, { useState, useEffect } from 'react';
import { Text, View, StyleSheet, TouchableOpacity, Alert, TextInput, ScrollView, SafeAreaView, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import axios from 'axios';

// ✅ POINTING TO YOUR LOCAL SERVER FOR TESTING
const API_URL = "https://ppl-warehouse-1qn1.onrender.com/api";

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  
  const [showSplash, setShowSplash] = useState(true);
  const [user, setUser] = useState(null); 
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');

  const [scanned, setScanned] = useState(false);
  const [product, setProduct] = useState(null);
  const [quantity, setQuantity] = useState('');
  const [manualCode, setManualCode] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => { setShowSplash(false); }, 3000);
    return () => clearTimeout(timer);
  }, []);

  const handleLogin = async () => {
    if (!passwordInput || !usernameInput) return Alert.alert("Error", "Please enter credentials");
    
    try {
      const res = await axios.post(`${API_URL}/login`, {
        username: usernameInput.toLowerCase().trim(),
        password: passwordInput.trim()
      });
      if (res.data.success) {
        setUser({ username: res.data.username, role: res.data.role });
        setPasswordInput(''); 
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || "Cannot connect to server. Check your internet.";
      Alert.alert("Login Failed ❌", errorMsg);
    }
  };

  const handleSearch = async (searchCode) => {
    if (!searchCode) return Alert.alert("Error", "Please enter a code");
    setScanned(true); 
    try {
      const res = await axios.get(`${API_URL}/product/${searchCode.trim()}`);
      setProduct(res.data);
      setManualCode(''); 
    } catch (err) {
      Alert.alert("Not Found", `Code ${searchCode} is not in the system.`, [{ text: "OK", onPress: () => setScanned(false) }]);
    }
  };

  const handleStandardUpdate = async (type) => {
    if (!quantity || isNaN(parseInt(quantity)) || parseInt(quantity) <= 0) {
      return Alert.alert("Error", "Please enter a valid quantity.");
    }
    
    try {
      const res = await axios.post(`${API_URL}/stock`, {
        barcode: product.barcode || product.productCode, 
        type: type, 
        quantity: parseInt(quantity),
        username: user.username 
      });
      Alert.alert("Success! ✅", `${type} recorded.\nNew Stock: ${res.data.newStock}`, [{ text: "Scan Next", onPress: resetApp }]);
    } catch (err) { 
      Alert.alert("Failed", "Server Error. Could not update stock."); 
    }
  };

  const resetApp = () => { 
    setScanned(false); 
    setProduct(null); 
    setQuantity(''); 
  };

  const handleLogout = () => { 
    setUser(null); 
    setUsernameInput(''); 
  };

  if (!permission?.granted) {
    return (
      <View style={styles.centered}>
        <Text style={{marginBottom: 20}}>Camera permission required.</Text>
        <TouchableOpacity style={styles.btnGreen} onPress={requestPermission}><Text style={styles.btnText}>Enable Camera</Text></TouchableOpacity>
      </View>
    );
  }

  if (showSplash) {
    return (
      <View style={styles.splashContainer}>
        <Text style={styles.splashLogo}>PPL</Text>
        <ActivityIndicator size="large" color="#007bff" style={{ marginTop: 20, transform: [{ scale: 1.5 }] }} />
        <Text style={styles.splashText}>LOADING ERP SYSTEM...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.loginContainer}>
        <View style={styles.loginCard}>
          <Text style={styles.loginTitle}>PPL ERP App</Text>
          <Text style={styles.loginSubtitle}>Authorized Personnel Only</Text>
          <TextInput style={styles.loginInput} placeholder="Username" value={usernameInput} onChangeText={setUsernameInput} autoCapitalize="none" />
          <TextInput style={styles.loginInput} placeholder="Password" value={passwordInput} onChangeText={setPasswordInput} secureTextEntry={true} />
          <TouchableOpacity style={styles.loginBtn} onPress={handleLogin}><Text style={styles.btnText}>Login Securely</Text></TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {!scanned ? (
        <View style={{flex: 1}}>
          <View style={styles.header}>
            <View>
              <Text style={styles.headerText}>Inventory Scanner</Text>
              <Text style={{color: '#e0e0e0', fontSize: 12}}>User: {user.username}</Text>
            </View>
            <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}><Text style={{color: 'white', fontWeight: 'bold'}}>Logout</Text></TouchableOpacity>
          </View>
          
          <View style={styles.searchContainer}>
            <TextInput style={styles.searchInput} placeholder="Type product code..." value={manualCode} onChangeText={setManualCode} autoCapitalize="characters" />
            <TouchableOpacity style={styles.searchBtn} onPress={() => handleSearch(manualCode)}><Text style={styles.searchBtnText}>Search</Text></TouchableOpacity>
          </View>

          <View style={styles.cameraContainer}>
             <CameraView style={StyleSheet.absoluteFillObject} onBarcodeScanned={({data}) => handleSearch(data)} />
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.detailsBox}>
          {product && (
            <View style={{width: '100%'}}>
              <Text style={styles.itemTitle}>{String(product.productCode || 'UNKNOWN CODE')}</Text>
              
              {/* --- INVENTORY DETAILS TABLE --- */}
              <View style={styles.card}>
                <View style={styles.infoRow}>
                  <Text style={styles.label}>A/F:</Text>
                  <Text style={styles.val}>{product.af || 'N/A'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.label}>Weight:</Text>
                  <Text style={styles.val}>{product.weight || 'N/A'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.label}>Grade:</Text>
                  <Text style={styles.val}>{product.grade || 'N/A'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.label}>Length:</Text>
                  <Text style={styles.val}>{product.length || 'N/A'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.label}>Prod. Readied (FG):</Text>
                  <Text style={[styles.val, {color: '#28a745'}]}>{String(product.productionReadied || 0)}</Text>
                </View>
                <View style={[styles.infoRow, {borderBottomWidth: 0, marginTop: 5}]}>
                  <Text style={[styles.label, {fontSize: 16, color: '#333'}]}>Current Stock:</Text>
                  <Text style={[styles.val, {color: '#007bff', fontSize: 20}]}>{String(product.currentStock || 0)}</Text>
                </View>
              </View>

              {/* --- ACTION AREA --- */}
              <View style={styles.actionBox}>
                <Text style={styles.qtyLabel}>Enter Quantity:</Text>
                <TextInput 
                  style={styles.inputBig} 
                  keyboardType="numeric" 
                  placeholder="0"
                  value={quantity} 
                  onChangeText={setQuantity} 
                />

                <View style={styles.btnRow}>
                  <TouchableOpacity style={styles.btnGreen} onPress={() => handleStandardUpdate('INWARD')}>
                    <Text style={styles.btnText}>+ INWARD</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity style={styles.btnRed} onPress={() => handleStandardUpdate('DISPATCH')}>
                    <Text style={styles.btnText}>- DISPATCH</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity style={styles.cancelBtn} onPress={resetApp}>
                <Text style={styles.cancelText}>Cancel & Rescan</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  splashContainer: { flex: 1, backgroundColor: '#ffffff', justifyContent: 'center', alignItems: 'center' },
  splashLogo: { fontSize: 80, fontWeight: '900', color: '#007bff', letterSpacing: 5 },
  splashText: { marginTop: 40, color: '#666', fontSize: 16, fontWeight: 'bold', letterSpacing: 2 },
  loginContainer: { flex: 1, backgroundColor: '#2c3e50', justifyContent: 'center', alignItems: 'center' },
  loginCard: { backgroundColor: 'white', padding: 30, borderRadius: 15, width: '85%', alignItems: 'center', elevation: 5 },
  loginTitle: { fontSize: 28, fontWeight: 'bold', color: '#007bff', marginBottom: 5 },
  loginSubtitle: { fontSize: 14, color: '#666', marginBottom: 25 },
  loginInput: { width: '100%', borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 15, marginBottom: 15, fontSize: 16, backgroundColor: '#f9f9f9' },
  loginBtn: { backgroundColor: '#007bff', width: '100%', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  header: { padding: 30, paddingTop: 50, backgroundColor: '#007bff', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerText: { color: 'white', fontSize: 22, fontWeight: 'bold' },
  logoutBtn: { backgroundColor: 'rgba(255,255,255,0.2)', padding: 8, borderRadius: 5 },
  searchContainer: { flexDirection: 'row', padding: 15, backgroundColor: 'white', elevation: 2, zIndex: 10 },
  searchInput: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#f9f9f9' },
  searchBtn: { backgroundColor: '#333', justifyContent: 'center', paddingHorizontal: 20, borderRadius: 8, marginLeft: 10 },
  searchBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  cameraContainer: { flex: 1, margin: 20, borderRadius: 20, overflow: 'hidden', backgroundColor: 'black' },
  detailsBox: { padding: 20, alignItems: 'center' },
  itemTitle: { fontSize: 28, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', color: '#333' },
  card: { backgroundColor: 'white', width: '100%', padding: 20, borderRadius: 10, elevation: 3, marginBottom: 20 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#eee', paddingVertical: 10 },
  label: { color: '#666', fontWeight: 'bold', fontSize: 15 },
  val: { fontWeight: 'bold', color: '#222', fontSize: 15 },
  actionBox: { backgroundColor: '#fff', padding: 20, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', width: '100%', marginBottom: 15, alignItems: 'center' },
  qtyLabel: { fontSize: 18, fontWeight: 'bold', marginBottom: 10, color: '#444' },
  inputBig: { borderBottomWidth: 3, borderColor: '#007bff', width: 150, fontSize: 40, textAlign: 'center', marginBottom: 25, color: '#333', paddingBottom: 5 },
  btnRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  btnGreen: { flex: 1, backgroundColor: '#28a745', padding: 18, borderRadius: 8, alignItems: 'center', marginHorizontal: 5, elevation: 2 },
  btnRed: { flex: 1, backgroundColor: '#dc3545', padding: 18, borderRadius: 8, alignItems: 'center', marginHorizontal: 5, elevation: 2 },
  btnText: { color: 'white', fontWeight: 'bold', fontSize: 16, letterSpacing: 1 },
  cancelBtn: { marginTop: 15, alignSelf: 'center', padding: 10 },
  cancelText: { color: '#888', fontSize: 16, fontWeight: 'bold' }
});